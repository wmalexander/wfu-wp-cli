# User Guide

## Overview

`wfuwp` is an internal command-line tool used by the WFU web development team. It has no frontend-facing output and is not visible to website visitors.

## Frontend Impact

This tool does not produce any user-facing features, pages, styles, or scripts. It is a developer and operations tool that runs in the terminal.

## Indirect Impact

While this tool has no direct impact on the visitor experience, it supports the infrastructure that serves WFU websites:

- **Environment synchronization** -- The `syncs3` command keeps uploaded media and site files consistent across development, testing, and production environments, ensuring that content displayed to visitors matches what was tested.
- **Local development** -- The `local` commands enable developers to work with production-like environments locally, reducing the risk of bugs reaching live sites.
- **Database management** -- The `restore` and `db` commands support disaster recovery and environment provisioning, ensuring site availability for visitors.
- **Release management** -- The `release cleanup` command keeps deployment branches synchronized, reducing the risk of deployment errors that could cause downtime.
- **DNS management** -- The `spoof`/`unspoof` commands help developers test sites in non-production environments using production-like URLs, ensuring accurate testing before changes go live.

## Accessibility

Not applicable. This tool is a command-line interface with no graphical user interface or web output.

## Browser/Device Support

Not applicable. This tool runs in a terminal environment (macOS, Linux, or Windows WSL) and does not interact with browsers or devices.
