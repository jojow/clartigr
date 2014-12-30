#!/bin/sh

echo "ARGS: $@"

echo "STDIN:"
read STDIN; echo $STDIN

echo "ENV:"
echo "FOO = $FOO"
echo "input_env = $input_env"

echo "FILE:"
cat ./input.txt

echo "some output written by script.sh\nline break\n" > ./output.txt
