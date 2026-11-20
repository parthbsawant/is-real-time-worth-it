#!/usr/bin/env bash
# Full training: both architectures, 3 seeds, up to 30 epochs each (early stopping, patience 5).
set -e
for arch in lstm transformer; do
  for seed in 0 1 2; do
    python -m src.train --arch "$arch" --seed "$seed" --epochs 30
  done
done
