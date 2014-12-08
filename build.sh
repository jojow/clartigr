#!/bin/bash

if [ -z "$ANY2API_BIN" ]; then
    ANY2API_BIN="any2api"
fi



rm -rf ./dist

$ANY2API_BIN -o ./dist gen ./apispec.json
