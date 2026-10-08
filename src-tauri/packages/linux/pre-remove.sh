#!/bin/bash
/usr/bin/cvr-app-service-uninstall

. /etc/os-release

if [ "$ID" = "deepin" ]; then
    if [ -f "/usr/share/applications/clash-verge-rev-app.desktop" ]; then
        echo "Removing deepin desktop file"
        rm -vf "/usr/share/applications/clash-verge-rev-app.desktop"
    fi
fi

