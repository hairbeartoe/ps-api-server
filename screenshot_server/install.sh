#!/usr/bin/env bash
# script for automatically install Chrome and NodeJS and npm dependencies on ubuntu

echo "*************************"
echo "Install Google Chrome..."
echo "*************************"
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb

echo "*************************"
echo "Install Nodejs"
echo "*************************"
sudo apt-get install curl -y
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs


echo "*************************"
echo "Install dependencies"
echo "*************************"
npm install
