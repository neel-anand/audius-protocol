package server

import (
	"context"
	"errors"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/inconshreveable/log15"
)

func (ss *MediorumServer) startBeamClient() {
	ctx := context.Background()

	// migration: create cid_lookup table
	ddl := `

	drop table if exists cid_temp;

	create table if not exists cid_lookup (
		"multihash" text,
		"host" text
	);

	create unique index if not exists "idx_multihash" on cid_lookup("multihash", "host");
	`

	_, err := ss.pgPool.Exec(ctx, ddl)
	if err != nil {
		log.Println("ddl failed", err)
		return
	}

	// polling:
	// beam cid lookup from peers on an interval
	for {
		time.Sleep(time.Minute + jitterSeconds(120))

		// beam data to a temp table
		// and then copy to main table
		// ignoring duplicates
		_, err := ss.pgPool.Exec(ctx, `
		create table if not exists cid_temp (like cid_lookup);
		truncate cid_temp;
		`)
		if err != nil {
			log.Println("create temp table failed", err)
		}

		startedAt := time.Now()
		wg := &sync.WaitGroup{}
		for _, peer := range ss.Config.Peers {
			if peer.Host == ss.Config.Self.Host {
				continue
			}
			peer := peer
			wg.Add(1)
			go func() {
				err := ss.beamFromPeer(peer)
				if err != nil {
					log.Println("beam failed", peer.Host, err)
				}
				wg.Done()
			}()
		}
		wg.Wait()

		// copy temp to main
		result, err := ss.pgPool.Exec(ctx, `
		begin;

		truncate cid_lookup;

		insert into cid_lookup (select * from cid_temp)
			on conflict do nothing;

		truncate cid_temp;

		commit;
		`)
		if err != nil {
			log.Println("insert from cid_temp failed", err)
		} else {
			log.Println("beam all done", "took", time.Since(startedAt), "added", result.RowsAffected())
		}

		time.Sleep(time.Minute*10 + jitterSeconds(120))
	}
}

func jitterSeconds(n int) time.Duration {
	return time.Second * time.Duration(rand.Intn(n))
}

func (ss *MediorumServer) beamFromPeer(peer Peer) error {
	ctx := context.Background()
	client := http.Client{
		Timeout: 5 * time.Minute,
	}

	startedAt := time.Now()
	logger := log15.New("beam_client", peer.Host)
	resp, err := client.Get(peer.ApiPath("beam/files"))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return errors.New(resp.Status)
	}

	// pgx COPY FROM
	conn, err := ss.pgPool.Acquire(ctx)
	if err != nil {
		logger.Warn(err.Error())
		return err
	}
	defer conn.Release()

	copySql := `COPY cid_temp FROM STDIN`
	result, err := conn.Conn().PgConn().CopyFrom(ctx, resp.Body, copySql)
	if err != nil {
		return err
	}

	logger.Info("beamed", "count", result.RowsAffected(), "took", time.Since(startedAt))
	return nil
}
