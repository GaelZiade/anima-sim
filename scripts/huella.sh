#!/bin/sh
# Huella de la simulación sin las velocidades: `scripts/huella.sh > antes.txt`, cambiar, y `diff`.
npm run --silent bench -- huella "$@" | sed 's/ *[0-9]* combates\/s//'
