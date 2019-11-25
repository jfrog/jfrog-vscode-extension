import sys

virtualenv_prefix = getattr(sys, "real_prefix", None)
venv_prefix = getattr(sys, "base_prefix", sys.prefix)
if virtualenv_prefix or venv_prefix != sys.prefix:
    exit(0)

exit(1)
