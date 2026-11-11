# Runtime configuration

| Setting    | Development (`just serve`)       | Production server / Docker |
|------------|----------------------------------|----------------------------|
| `DATA_DIR` | `./data`                         | `/data`                    |
| `PORT`     | API: `8080`; Vite client: `5173` | `8080`                     |

Development creates its gitignored data directory on first save. Set `DATA_DIR`
in the environment to override it.

## Docker Compose

Compose reads overrides from a `.env` file in the repository root.

| Variable   | Default   | Meaning                                                                |
|------------|-----------|------------------------------------------------------------------------|
| `PORT`     | `8080`    | Both the published host port and the server port inside the container. |
| `DATA_DIR` | `/data`   | Container path for the data mount. The host path remains `./data`.     |
| `HOST_IP`  | `0.0.0.0` | Host interface used for the published port.                            |

For example, `PORT=8088` publishes and uses port 8088. `DATA_DIR=/data` is the
normal container path.

See [deployment](deployment.md) for mount ownership and network setup.
