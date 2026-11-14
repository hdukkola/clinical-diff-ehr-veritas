"""Allow running the CLI as `python -m mlx_runner.cli`."""
from .cli import main
import sys

sys.exit(main())