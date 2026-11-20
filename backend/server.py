"""Cross-platform production server; never enables Flask's debug server."""
import argparse
import os
from waitress import serve
from .app import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("GITA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5000")))
    args = parser.parse_args()
    print(f"Gita Path: http://{args.host}:{args.port}", flush=True)
    serve(create_app(), host=args.host, port=args.port, threads=4)


if __name__ == "__main__":
    main()
