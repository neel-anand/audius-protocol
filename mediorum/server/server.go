package server

import (
	"context"
	"crypto/ecdsa"
	"log"
	"mediorum/crudr"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/inconshreveable/log15"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"gocloud.dev/blob"
	_ "gocloud.dev/blob/fileblob"
)

type Peer struct {
	Host   string
	Wallet string
}

func (p Peer) ApiPath(parts ...string) string {
	// todo: remove this method, just use apiPath helper everywhere
	parts = append([]string{p.Host}, parts...)
	return apiPath(parts...)
}

type MediorumConfig struct {
	Env               string
	Self              Peer
	Peers             []Peer
	ReplicationFactor int
	Dir               string `default:"/tmp/mediorum"`
	BlobStoreDSN      string `json:"-"`
	PostgresDSN       string `json:"-"`
	LegacyFSRoot      string `json:"-"`
	PrivateKey        string `json:"-"`
	ListenPort        string `envconfig:"PORT"`

	// should have a basedir type of thing
	// by default will put db + blobs there

	// StoreAll          bool   // todo: set this to true for "full node"

	privateKey *ecdsa.PrivateKey
}

type MediorumServer struct {
	echo      *echo.Echo
	bucket    *blob.Bucket
	placement *placement
	logger    log15.Logger
	crud      *crudr.Crudr
	pgPool    *pgxpool.Pool
	quit      chan os.Signal

	StartedAt time.Time
	Config    MediorumConfig
}

var (
	apiBasePath = ""
)

func New(config MediorumConfig) (*MediorumServer, error) {
	config.Env = os.Getenv("MEDIORUM_ENV")

	// validate host config
	if config.Self.Host == "" {
		log.Fatal("host is required")
	} else if hostUrl, err := url.Parse(config.Self.Host); err != nil {
		log.Fatal("invalid host: ", err)
	} else if config.ListenPort == "" {
		config.ListenPort = hostUrl.Port()
	}

	if config.Dir == "" {
		config.Dir = "/tmp/mediorum"
	}

	if config.BlobStoreDSN == "" {
		config.BlobStoreDSN = "file://" + config.Dir + "/blobs"
	}

	if pk, err := parsePrivateKey(config.PrivateKey); err != nil {
		log.Println("invalid private key: ", err)
	} else {
		config.privateKey = pk
	}

	// ensure dir
	os.MkdirAll(config.Dir, os.ModePerm)
	if strings.HasPrefix(config.BlobStoreDSN, "file://") {
		os.MkdirAll(strings.TrimPrefix(config.BlobStoreDSN, "file://"), os.ModePerm)
	}

	// bucket
	bucket, err := blob.OpenBucket(context.Background(), config.BlobStoreDSN)
	if err != nil {
		return nil, err
	}

	// logger
	logger := log15.New("self", config.Self.Host)
	logger.SetHandler(log15.CallerFileHandler(log15.StdoutHandler))

	// db
	db := dbMustDial(config.PostgresDSN)

	// pg pool
	// config.PostgresDSN
	pgConfig, _ := pgxpool.ParseConfig(config.PostgresDSN)
	pgPool, err := pgxpool.NewWithConfig(context.Background(), pgConfig)
	if err != nil {
		log.Println("dial postgres failed", err)
	}

	// crud
	peerHosts := []string{}
	for _, peer := range config.Peers {
		if peer.Host == config.Self.Host {
			continue
		}
		peerHosts = append(peerHosts, peer.Host)
	}
	crud := crudr.New(config.Self.Host, peerHosts, db)
	dbMigrate(crud)

	// echoServer server
	echoServer := echo.New()
	echoServer.HideBanner = true
	echoServer.Debug = true

	// echoServer is the root server
	// it mostly exists to server the catch all reverse proxy rule at the end
	// most routes and middleware should be added to the `routes` group
	// mostly don't add CORS middleware here as it will break reverse proxy at the end
	echoServer.Use(middleware.Recover())
	echoServer.Use(middleware.Logger())
	echoServer.Pre(middleware.Rewrite(map[string]string{
		"/mediorum":   "/",
		"/mediorum/":  "/",
		"/mediorum/*": "/$1",
	}))

	ss := &MediorumServer{
		echo:      echoServer,
		bucket:    bucket,
		placement: newPlacement(config),
		crud:      crud,
		pgPool:    pgPool,
		logger:    logger,
		quit:      make(chan os.Signal, 1),

		StartedAt: time.Now().UTC(),
		Config:    config,
	}

	// routes holds all of our handled routes
	// and related middleware like CORS
	routes := echoServer.Group(apiBasePath)

	// Middleware
	routes.Use(middleware.CORS())

	// public: uis
	routes.GET("", ss.serveUploadUI)
	routes.GET("/", ss.serveUploadUI)

	// public: uploads
	routes.GET("/uploads", ss.getUploads)
	routes.GET("/uploads/:id", ss.getUpload)
	routes.POST("/uploads", ss.postUpload)

	routes.GET("/ipfs/:cid", ss.getBlob)
	routes.GET("/content/:cid", ss.getBlob)
	routes.GET("/ipfs/:jobID/:variant", ss.getV1CIDBlob)
	routes.GET("/content/:jobID/:variant", ss.getV1CIDBlob)
	routes.GET("/tracks/cidstream/:cid", ss.getBlob) // TODO: Log listen, check delisted status, respect cache in payload, and use `signature` queryparam for premium content

	// status + debug:
	routes.GET("/status", ss.getStatus)
	routes.GET("/debug/blobs", ss.dumpBlobs)
	routes.GET("/debug/uploads", ss.dumpUploads)
	routes.GET("/debug/ls", ss.getLs)

	// legacy:
	routes.GET("/cid/:cid", ss.serveLegacyCid)
	routes.GET("/cid/:dirCid/:fileName", ss.serveLegacyDirCid)
	routes.GET("/metadata", ss.serveCidMetadata)

	routes.GET("/beam/files", ss.servePgBeam)

	// internal
	internalApi := routes.Group("/internal")

	// internal: crud
	internalApi.GET("/crud/sweep", ss.serveCrudSweep)
	internalApi.POST("/crud/push", ss.serveCrudPush)

	// should health be internal or public?
	internalApi.GET("/health", ss.getMyHealth)
	internalApi.GET("/health/peers", ss.getPeerHealth)

	// internal: blobs
	internalApi.GET("/blobs/problems", ss.getBlobProblems)
	internalApi.GET("/blobs/location/:cid", ss.getBlobLocation)
	internalApi.GET("/blobs/info/:cid", ss.getBlobInfo)
	internalApi.GET("/blobs/:cid", ss.getBlob)
	internalApi.POST("/blobs", ss.postBlob, middleware.BasicAuth(ss.checkBasicAuth))

	// WIP internal: metrics
	internalApi.GET("/metrics", ss.getMetrics)

	// reverse proxy stuff
	if config.Env == "stage" || config.Env == "prod" {
		upstream, _ := url.Parse("http://server:4000")
		proxy := httputil.NewSingleHostReverseProxy(upstream)
		echoServer.Any("*", echo.WrapHandler(proxy))
	}

	return ss, nil

}

func (ss *MediorumServer) MustStart() {

	// start server
	go func() {

		err := ss.echo.Start(":" + ss.Config.ListenPort)
		if err != nil && err != http.ErrServerClosed {
			panic(err)
		}
	}()

	go ss.startTranscoder()

	go ss.startHealthBroadcaster()

	go ss.startRepairer()

	ss.crud.StartClients()

	// disable pg_beam in prod for now.
	// plan is to make it more evented and enable everywhere
	// before making mediorum "first"
	if ss.Config.Env != "prod" {
		go ss.startBeamClient()
	}

	// signals
	signal.Notify(ss.quit, os.Interrupt, syscall.SIGTERM)
	<-ss.quit
	close(ss.quit)

	ss.Stop()
}

func (ss *MediorumServer) Stop() {
	ss.logger.Debug("stopping")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := ss.echo.Shutdown(ctx); err != nil {
		ss.logger.Crit("echo shutdown: " + err.Error())
	}

	if db, err := ss.crud.DB.DB(); err == nil {
		if err := db.Close(); err != nil {
			ss.logger.Crit("db shutdown: " + err.Error())
		}
	}

	// todo: stop transcode worker + repairer too

	ss.logger.Debug("bye")

}
