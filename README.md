# ESB Lights Card

Dashboard card for the Kinetic weathervane lights: a strip of swatches labelled
with their hex codes, then tonight's colour name and the occasion behind it.

Transparent by design — it paints no background of its own and takes all text
colour from Home Assistant theme variables, so it sits on whatever theme is
active. The only fixed colours are the swatches themselves and the `#00ADEF`
hex pills, carried over from the original esblights.kinetic.com.

## Install

**HACS → ⋮ → Custom repositories**, add this repo with category **Dashboard**,
then install. HACS registers the resource for you.

Add it to a dashboard from the card picker — it appears as **ESB Lights** — and
configure it in the visual editor. No YAML required.

## Options

| Option | Purpose |
|---|---|
| `entity` | Sensor to read. Recommended. |
| `api_url` | Base URL of the API. Alternative to `entity`. |
| `api_key` | Sent as `?apikey=`. Needs `api_url`. |
| `refresh_seconds` | Poll interval in direct mode. Default 3600. |
| `show_reason` | Show the occasion. Default true. |
| `show_hex` | Show hex codes on the swatches. Default true. |
| `height` | Swatch strip height in px. Default 250. |

Two ways to get data, and the difference matters:

**Sensor** (recommended) reads `sensor.esb_lights_color` from the
[esblights integration](https://github.com/KineticTeam/esblights-hacs). Home
Assistant fetches server-side, so the card works over remote access and the API
key never reaches a browser.

**Direct** fetches from the viewer's browser. Useful if you want the card
independent of the integration, but it only works on a network that can reach
the API — blank over Nabu Casa or any external URL.

## Behaviour

- Hex labels scale down as the colour count rises, so six codes still read.
- An unavailable sensor renders a muted "API unreachable" state rather than an
  empty strip.
