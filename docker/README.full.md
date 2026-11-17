# TrendRadar full-stack server deployment

This deployment runs the collector, AI filtering, entity snapshot exporter,
Web application, Inbox and HTTPS reverse proxy from one repository checkout.

```bash
cp docker/.env.full.example docker/.env.full
# Edit docker/.env.full, point the domain DNS record at this server, then:
docker compose --env-file docker/.env.full -f docker/docker-compose.full.yml up -d --build
```

Persistent state is stored in the repository's ignored `output/` directory:
SQLite databases, HTML reports, `web/entities.json`, extraction cache and
`inbox.json`.  Editable interest rules remain in `config/`. Back up both
directories before moving servers.

The server needs inbound TCP 80/443 (and optionally UDP 443 for HTTP/3).
The collector and Web app use the same 30-minute schedule by default. Set
`IMMEDIATE_RUN=true` only when an initial collection should run at startup;
it may send configured notifications.
