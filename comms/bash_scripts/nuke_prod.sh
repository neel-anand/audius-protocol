#!/bin/bash

source ./bash_scripts/nodes.sh

for val in $prod_nodes_discovery; do
  echo "$val"
  ssh $val 'bash -s' < bash_scripts/nuke_server.sh
done

# for val in $prod_nodes_content; do
#   echo "$val"
#   ssh $val 'bash -s' < bash_scripts/nuke_server.sh
# done
