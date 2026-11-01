# BLUENODES

**A self-hosted Minecraft hosting panel — one command, port 6868, made by blue.**

BLUENODES installs a complete Minecraft server panel on your own VPS in one command.
Create vanilla or Paper servers, watch the live console, edit files, take backups and
monitor the host — all from a fast blue dashboard running on **port 6868**.

No Docker. No database. No npm dependencies. Just Node.js.

```
██████╗  ██╗      ██╗   ██╗ ███████╗ ███╗   ██╗  ██████╗  ██████╗  ███████╗ ███████╗
██╔══██╗ ██║      ██║   ██║ ██╔════╝ ████╗  ██║ ██╔═══██╗ ██╔══██╗ ██╔════╝ ██╔════╝
██████╔╝ ██║      ██║   ██║ █████╗   ██╔██╗ ██║ ██║   ██║ ██║  ██║ █████╗   ███████╗
██╔══██╗ ██║      ██║   ██║ ██╔══╝   ██║╚██╗██║ ██║   ██║ ██║  ██║ ██╔══╝   ╚════██║
██████╔╝ ███████╗ ╚██████╔╝ ███████╗ ██║ ╚████║ ╚██████╔╝ ██████╔╝ ███████╗ ███████║
╚═════╝  ╚══════╝  ╚═════╝  ╚══════╝ ╚═╝  ╚═══╝  ╚═════╝  ╚═════╝  ╚══════╝ ╚══════╝

   made by blue   ·   minecraft hosting panel   ·   port 6868
```

---

## Install — one command

On any Debian / Ubuntu VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/siddhantpashte123-hub/blue.pannel/main/cli/bluenodes -o /tmp/bluenodes && sudo bash /tmp/bluenodes
```

The command prints the banner and opens the menu:

```
  1  INSTALL      install panel on port 6868
  2  UNINSTALL    stop and remove the panel
  3  STATUS       panel, java and servers
  4  START        start the panel
  5  STOP         stop the panel
  6  RESTART      restart the panel
  7  LOGS         follow panel logs
  8  UPDATE       download the latest version
  9  INSTALL JAVA install openjdk for minecraft
  0  EXIT

  choose an option ›
```

Pick **1** and the panel is installed, started and reachable at:

```
http://<your-server-ip>:6868
```

Already root without `sudo`? Use `bash /tmp/bluenodes`.

Non-interactive install (CI / scripts):

```bash
curl -fsSL https://raw.githubusercontent.com/siddhantpashte123-hub/blue.pannel/main/cli/bluenodes -o /tmp/bluenodes
sudo bash /tmp/bluenodes install
```

### Jaldi shuru (Hinglish)

```bash
curl -fsSL https://raw.githubusercontent.com/siddhantpashte123-hub/blue.pannel/main/cli/bluenodes -o /tmp/bluenodes && sudo bash /tmp/bluenodes
```

1. Banner + menu aayega → **1 INSTALL** dabao. Panel seedha **port 6868** par chalu ho jayega.
2. Browser me `http://<vps-ip>:6868` kholo.
3. **Create server** → version chuno (ya latest chip) → *Install server*.
4. **Start** dabao. Minecraft me `<vps-ip>:25565` (ya jo port chuna) se join karo.
5. Java nahi hai? Menu me **9 INSTALL JAVA** chala lo (MC 1.20.5+ ke liye Java 21).

### What the installer does

1. Checks for Node.js 18+ and installs it if missing.
2. Copies the panel to `/opt/bluenodes` (or `~/.bluenodes` for non-root).
3. Creates a `bluenodes` **systemd** service (or a background process when systemd is unavailable).
4. Starts the panel on **0.0.0.0:6868** and prints the URL.
5. Installs the `bluenodes` command in `/usr/local/bin`.
6. Warns you if Java is missing (needed to actually run Minecraft servers).

---

## Requirements

| Item | Notes |
|---|---|
| OS | Debian / Ubuntu recommended, any Linux with bash |
| User | root (or `sudo`) for a system-wide install |
| Node.js | 18+ — installed automatically if missing |
| Java | Java 21 for MC 1.20.5+, Java 17 for 1.17–1.20.4, Java 8 for older |
| Ports | **6868/tcp** for the panel + every Minecraft server port you create |
| RAM | 2 GB+ for the panel and a small server; 4 GB+ recommended |

Open the ports in your provider's cloud firewall **and** in ufw/iptables, for example:

```bash
sudo ufw allow 6868/tcp      # panel
sudo ufw allow 25565/tcp     # first minecraft server
sudo ufw allow 25565/udp
```

Install Java with the CLI:

```bash
sudo bluenodes install-java        # openjdk 21 headless
sudo bluenodes install-java 17     # older Minecraft versions
```

---

## Panel features

- **Dashboard** — server count, live players, CPU / RAM / disk gauges, node health.
- **Create server** — Vanilla (Mojang jar) or Paper, version picker with popular presets,
  RAM slider, port, MOTD, gamemode, difficulty, auto-restart, EULA.
- **Live console** — real server stdout over SSE, command input, quick commands
  (`list`, `say`, `save-all`, `tps`), player join/leave tracking.
- **File manager** — browse the server folder, edit `server.properties`, YAML or any text file,
  create files and folders, delete.
- **Properties editor** — friendly editor for every `server.properties` key.
- **Backups** — one-click `tar.gz` backups, download, restore, delete.
- **Settings** — rename, RAM, port, EULA, auto-restart, force kill, delete server.
- **System page** — host, OS, CPU model, load, disk, Java runtime and panel details.
- **Optional token auth** — set `BLUENODES_TOKEN` to protect the panel.

---

## CLI reference

```
bluenodes                 interactive menu (banner + options)
bluenodes install         install + start the panel on port 6868
bluenodes uninstall       stop and remove the panel
bluenodes uninstall --purge   ...and delete all Minecraft server data
bluenodes status          panel state, resources, Java, server table
bluenodes start|stop|restart
bluenodes logs            follow panel logs
bluenodes update          update to the latest build and restart
bluenodes install-java [21|17] [--force]
bluenodes help            all commands
```

`status` example:

```
  STATUS
  ────────────────────────────────────────────────────────────
  state      running (systemd)
  url        http://203.0.113.7:6868
  install    /opt/bluenodes
  data       /opt/bluenodes/data
  node       v20.18.1
  java       21.0.1
  panel      v1.0.0 · pid 812 · up 3600s
  host       mc-node-1 · 4 cores · AMD EPYC 7B12
  cpu        12.4%
  memory     1.2 GB / 7.8 GB (15.4%)
  disk       6.1 GB / 78.2 GB (7.8%)
  ────────────────────────────────────────────────────────────
  NAME                STATUS    PORT   PLAYERS  SOFTWARE
  ----------------------------------------------------------------
  Blue SMP            running   25565  2        vanilla 1.21.4

  1 server(s), 1 running
```

---

## Using the panel

1. Open `http://<ip>:6868`.
2. **Create server** → name, software, version, RAM → *Install server*.
   The jar is downloaded once from Mojang (or Paper) and cached, so extra servers are instant.
3. Press **Start**. First boot generates the world — watch the console.
4. Connect from Minecraft with `<your-ip>:<server-port>` (default `25565`).
5. Manage files, properties, backups and settings from the server page.

The panel itself is **not** the Minecraft port. The panel listens on `6868`; every server gets
its own port (`25565`, `25566`, …) that you pick when creating it.

---

## Running from source (development)

```bash
git clone https://github.com/siddhantpashte123-hub/blue.pannel.git
cd blue.pannel/panel
node server.js
# panel: http://localhost:6868
```

No `npm install` needed — the panel uses only the Node.js standard library.

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `BLUENODES_PORT` | `6868` | Panel port |
| `BLUENODES_HOST` | `0.0.0.0` | Bind address |
| `BLUENODES_HOME` | `~/.bluenodes/data` | Servers, jars, cache, backups |
| `BLUENODES_TOKEN` | *(empty)* | Optional bearer token for the API + UI |
| `BLUENODES_DIR` | `/opt/bluenodes` | CLI install directory |
| `BLUENODES_DATA` | `$BLUENODES_DIR/data` | CLI data directory |
| `BLUENODES_BIN` | `/usr/local/bin` | Where the CLI is installed |
| `BLUENODES_BRANCH` | `main` | Git branch used by install/update |
| `NO_COLOR` | *(empty)* | Disable CLI colors |

---

## Project layout

```
blue.pannel/
├── cli/
│   └── bluenodes            # one-command installer + menu (bash)
├── panel/
│   ├── server.js            # HTTP server, API, static files, SSE
│   ├── lib/
│   │   ├── manager.js       # servers, files, backups, jobs
│   │   ├── mcserver.js      # Minecraft process control + console parsing
│   │   ├── download.js      # Mojang / Paper downloader with cache + mirrors
│   │   ├── system.js        # CPU, RAM, disk, Java detection
│   │   └── util.js
│   └── public/
│       ├── index.html
│       ├── styles.css
│       └── js/{core,views,actions}.js
└── README.md
```

Runtime data (not in git):

```
/opt/bluenodes/data/
├── servers/<id>/            # server.jar, server.properties, world/, plugins/…
├── jars/                    # cached vanilla / paper jars
├── cache/                   # Mojang version manifest
├── backups/                 # <server>-<timestamp>.tar.gz
├── servers.json
└── runtime.json
```

---

## API

All endpoints return `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Panel health, version, Java status |
| GET | `/api/system` | Host + panel resources |
| GET | `/api/versions` | Minecraft + Paper version lists |
| GET | `/api/servers` | All servers |
| POST | `/api/servers` | Create server (returns a job id) |
| GET | `/api/jobs/:id` | Creation job progress |
| GET | `/api/servers/:id` | Server details + logs + properties |
| POST | `/api/servers/:id/start` \| `stop` \| `restart` \| `kill` | Lifecycle |
| POST | `/api/servers/:id/command` | Send console command |
| GET/POST | `/api/servers/:id/properties` | Read / write `server.properties` |
| POST | `/api/servers/:id/settings` | Rename, RAM, port, EULA, auto-restart |
| GET | `/api/servers/:id/files?path=` | List directory |
| GET/POST | `/api/servers/:id/file` | Read / write a file |
| POST | `/api/servers/:id/mkdir` \| `delete-file` | Folder / file operations |
| GET/POST | `/api/servers/:id/backups` | List / create backups |
| POST | `/api/servers/:id/backups/restore` \| `delete` | Manage backups |
| GET | `/api/servers/:id/backups/download?file=` | Download a backup |
| DELETE | `/api/servers/:id` | Delete a server |
| GET | `/api/events` | SSE stream: logs, state, stats, jobs |

---

## Troubleshooting

**"Java is not installed" when starting a server**
Run `sudo bluenodes install-java` (Java 21) or `install-java 17` for older versions.

**Panel not reachable on 6868**
Check the service and the firewall:
`sudo bluenodes status`, `sudo ufw allow 6868/tcp`, and open 6868 in your cloud provider.

**Port already in use**
Each server needs a free port. Create the next server with `25566` instead of `25565`.

**Version list shows "offline"**
The host cannot reach Mojang. Check DNS/outbound HTTPS; you can still type a version manually.
The panel retries through a mirror (`bmclapi`) if the official endpoint fails.

**Server killed / world not saved**
Use **Stop** (sends `stop` to the console). *Kill* is a hard `SIGKILL` and may lose recent chunks.

**Where is everything installed?**
`/opt/bluenodes` (panel) and `/opt/bluenodes/data` (servers, backups).
`sudo bluenodes uninstall --purge` removes both.

---

## Security

The panel has **no authentication by default** — it is designed for a private VPS behind a firewall.
For a public machine, set a token before starting:

```bash
sudo systemctl edit bluenodes
# [Service]
# Environment=BLUENODES_TOKEN=change-me
sudo systemctl restart bluenodes
```

or run `BLUENODES_TOKEN=change-me node server.js`. Requests then need
`Authorization: Bearer change-me` (the UI accepts `?token=change-me` once).

The panel runs Minecraft as the same user as the service (root when installed as root).
For production, create a dedicated `minecraft` user and run the service as that user.

---

## License

MIT — see [LICENSE](LICENSE).

---

**BLUENODES** — made with 💙 by **blue**.
