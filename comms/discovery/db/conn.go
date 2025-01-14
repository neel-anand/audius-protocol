package db

import (
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/inconshreveable/log15"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var (
	Conn *sqlx.DB
)

func MustGetAudiusDbUrl() string {
	dbUrlString := os.Getenv("audius_db_url")
	if dbUrlString == "" {
		log.Fatal("audius_db_url is required")
	}

	if !strings.HasSuffix(dbUrlString, "?sslmode=disable") {
		dbUrlString += "?sslmode=disable"
	}

	return dbUrlString
}

func Dial() error {
	var err error

	if Conn != nil {
		return nil
	}

	dsn := MustGetAudiusDbUrl()

	dbUrl, err := url.Parse(dsn)
	if err != nil {
		log.Fatal("invalid db string: "+dsn, "err", err)
	}

	logger := log15.New("host", dbUrl.Host, "db", dbUrl.Path)
	logger.SetHandler(log15.StreamHandler(os.Stdout, log15.TerminalFormat()))

	Conn, err = sqlx.Open("postgres", dsn)
	if err != nil {
		logger.Crit("database.Dial failed " + err.Error())
		return err
	}
	logger.Info("database dialed")

	return nil
}
