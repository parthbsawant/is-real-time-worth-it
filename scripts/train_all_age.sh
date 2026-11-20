#!/usr/bin/env bash
# Follow-up experiment: the same six runs with the elapsed-time input added.
set -e
for arch in lstm transformer; do
  for seed in 0 1 2; do
    python -m src.train --arch "$arch" --seed "$seed" --epochs 30 --age
  done
done
