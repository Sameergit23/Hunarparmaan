import sys
from pathlib import Path

# Lets tests import the shared helpers in this folder (contract.py).
sys.path.insert(0, str(Path(__file__).resolve().parent))
