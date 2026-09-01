/* ESB Lights - Home Assistant custom card.

   Renders tonight's Empire State Building color scheme: a strip of swatches
   labelled with their hex codes, then the description and the occasion.
   Transparent by design - it paints no background of its own and takes all text
   color from HA theme variables, so it sits on whatever theme is active.

   Two ways to get data, chosen in the card editor:
     Sensor  read an existing REST sensor (default, works over remote access)
     Direct  call the esblights API itself, with an optional API key

   Ships a visual editor, so the API address and key are set in the dashboard UI
   rather than by hand-editing YAML.

   Install via HACS (custom repository, category Dashboard) or by copying this
   file to <config>/www/ and adding it as a JavaScript Module resource.
   Notes:
   08/14/2026 - Written to replace the markdown card, so the API URL and key are
                real card options rather than something baked into a template
   09/01/2026 - Added getConfigElement + editor so setup happens in the UI */

const CARD_VERSION = "1.1.0";

//Kept from the old site as the single brand accent
const PILL_BG = "#00ADEF";
const STRIP_HEIGHT = 250;
const DEFAULT_REFRESH_SECONDS = 3600;

/* ========================================================== the card ==== */

class EsbLightsCard extends HTMLElement
{
    constructor()
    {
        super();
        this.attachShadow({ mode: "open" });
        this._config = {};
        this._data = null;
        this._error = null;
        this._signature = null;
        this._timer = null;
    }

    static getConfigElement()
    {
        return document.createElement("esb-lights-card-editor");
    }

    //Shown in the "add card" picker before the user edits anything
    static getStubConfig()
    {
        return { entity: "sensor.esb_light_color" };
    }

    /**
     * Called by HA whenever the card's config changes. Must throw on bad config.
     * @param {Object} config
     */
    setConfig(config)
    {
        if (!config || (!config.entity && !config.api_url))
        {
            throw new Error("Choose a sensor, or enter the API address.");
        }

        if (config.api_key && !config.api_url)
        {
            throw new Error("An API key needs an API address to go with it.");
        }

        this._config = {
            entity: config.entity || null,
            api_url: config.api_url ? String(config.api_url).replace(/\/+$/, "") : null,
            api_key: config.api_key || null,
            show_reason: config.show_reason !== false,
            show_hex: config.show_hex !== false,
            height: Number(config.height) || STRIP_HEIGHT,
            refresh_seconds: Number(config.refresh_seconds) || DEFAULT_REFRESH_SECONDS,
        };

        this._signature = null;
        this._startPolling();
        this._render();
    }

    getCardSize()
    {
        return 5;
    }

    /* ------------------------------------------------------- data in --- */

    set hass(hass)
    {
        this._hass = hass;

        //In direct mode the poll owns the data; nothing to read from state
        if (this._config.api_url || !this._config.entity)
        {
            return;
        }

        const state = hass.states[this._config.entity];
        if (!state)
        {
            this._error = `Entity ${this._config.entity} not found`;
            this._data = null;
            this._renderIfChanged();
            return;
        }

        if (state.state === "unavailable" || state.state === "unknown")
        {
            this._error = `Sensor is ${state.state}`;
            this._data = null;
            this._renderIfChanged();
            return;
        }

        this._error = null;
        this._data = {
            colorDescription: state.state,
            hexCodes: state.attributes.hexCodes || [],
            reason: state.attributes.reason || "",
        };
        this._renderIfChanged();
    }

    connectedCallback()
    {
        this._startPolling();
    }

    disconnectedCallback()
    {
        this._stopPolling();
    }

    _startPolling()
    {
        this._stopPolling();

        if (!this._config.api_url)
        {
            return;
        }

        this._fetch();
        this._timer = setInterval(() => this._fetch(), this._config.refresh_seconds * 1000);
    }

    _stopPolling()
    {
        if (this._timer)
        {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * Fetch straight from the esblights API. Only used in direct mode.
     * Runs in the viewer's browser, so that browser has to reach the API -
     * fine on the local network, blank over remote access.
     */
    async _fetch()
    {
        const query = this._config.api_key
            ? `?apikey=${encodeURIComponent(this._config.api_key)}`
            : "";

        try
        {
            const response = await fetch(`${this._config.api_url}/api/esb-light-data${query}`);

            if (!response.ok)
            {
                //401 here almost always means the key is missing or wrong
                throw new Error(response.status === 401
                    ? "Unauthorized - check the API key"
                    : `API returned ${response.status}`);
            }

            const body = await response.json();
            const content = body.content || {};

            this._error = null;
            this._data = {
                colorDescription: content.colorDescription || "",
                hexCodes: content.hexCodes || [],
                reason: content.reason || "",
            };
        }
        catch (error)
        {
            this._error = error.message;
            this._data = null;
        }

        this._renderIfChanged();
    }

    /* ------------------------------------------------------ rendering -- */

    //HA sets hass on every state change in the system; only redraw on real change
    _renderIfChanged()
    {
        const signature = JSON.stringify([this._data, this._error]);
        if (signature === this._signature)
        {
            return;
        }
        this._signature = signature;
        this._render();
    }

    _pillSize(count)
    {
        if (count <= 3) return "1.2rem";
        if (count <= 5) return "1rem";
        return "0.78rem";
    }

    _escape(text)
    {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    }

    _render()
    {
        const config = this._config;
        const data = this._data;
        const hasColors = data && Array.isArray(data.hexCodes) && data.hexCodes.length > 0;

        const strip = hasColors
            ? data.hexCodes.map((hex) => `
                <div class="swatch" style="background:${this._escape(hex)}">
                  ${config.show_hex
                      ? `<span class="pill" style="font-size:${this._pillSize(data.hexCodes.length)}">${this._escape(hex)}</span>`
                      : ""}
                </div>`).join("")
            : `<div class="swatch empty"></div>`;

        const heading = hasColors
            ? this._escape(String(data.colorDescription).replace(/\b\w/g, (c) => c.toUpperCase()))
            : "Unavailable";

        const caption = hasColors
            ? (config.show_reason && data.reason ? this._escape(data.reason) : "")
            : this._escape(this._error || "No data");

        this.shadowRoot.innerHTML = `
          <style>
            :host { display: block; }
            .wrap {
              background: transparent;
              font-family: Inter, Verdana, "Century Gothic", "Trebuchet MS", sans-serif;
              font-weight: 300;
            }
            .strip {
              display: flex;
              flex-direction: row;
              height: ${config.height}px;
              border-radius: 1rem;
              overflow: hidden;
            }
            .swatch { flex: 1; min-width: 0; display: grid; place-items: center; }
            .swatch.empty { background: var(--disabled-color, #9E9E9E); opacity: .35; }
            .pill {
              color: #ffffff;
              background: ${PILL_BG};
              line-height: 1.3em;
              padding: 2px 10px;
              margin: 8px;
              border-radius: 8px;
              text-align: center;
              white-space: nowrap;
            }
            .info { padding: 20px 8px 4px; text-align: center; }
            .desc { color: var(--primary-text-color); font-size: 1.7rem; line-height: 1.3em; }
            .reason {
              color: var(--secondary-text-color);
              font-size: 1.1rem;
              line-height: 1.3em;
              margin-top: 8px;
            }
          </style>
          <div class="wrap">
            <div class="strip">${strip}</div>
            <div class="info">
              <div class="desc">${heading}</div>
              ${caption ? `<div class="reason">${caption}</div>` : ""}
            </div>
          </div>`;
    }
}

/* ======================================================== the editor ==== */

class EsbLightsCardEditor extends HTMLElement
{
    constructor()
    {
        super();
        this.attachShadow({ mode: "open" });
        this._config = {};
        this._built = false;
        //Tracked explicitly: an empty api_url is still "direct" mode, and
        //inferring from a falsy value would snap the form back to sensor
        this._modeValue = "sensor";
    }

    setConfig(config)
    {
        this._config = Object.assign({}, config);
        this._modeValue = config && config.api_url ? "direct" : "sensor";
        this._build();
        this._sync();
    }

    set hass(hass)
    {
        this._hass = hass;
        //Entity list only becomes available once hass lands
        this._fillEntities();
    }

    //Tell HA the config changed so it can re-render the preview and save
    _emit()
    {
        this.dispatchEvent(new CustomEvent("config-changed", {
            detail: { config: this._config },
            bubbles: true,
            composed: true,
        }));
    }

    _mode()
    {
        return this._modeValue;
    }

    _build()
    {
        if (this._built)
        {
            return;
        }
        this._built = true;

        this.shadowRoot.innerHTML = `
          <style>
            :host { display: block; }
            .form { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
            .row { display: flex; flex-direction: column; gap: 6px; }
            label {
              font-size: 12px;
              color: var(--secondary-text-color);
              letter-spacing: .02em;
            }
            input[type="text"], input[type="password"], input[type="number"], select {
              width: 100%;
              box-sizing: border-box;
              padding: 10px 12px;
              font: inherit;
              font-size: 14px;
              color: var(--primary-text-color);
              background: var(--card-background-color, var(--ha-card-background, #fff));
              border: 1px solid var(--divider-color, #cfcfcf);
              border-radius: 6px;
            }
            input:focus, select:focus {
              outline: 2px solid var(--primary-color, ${PILL_BG});
              outline-offset: 1px;
            }
            .check { flex-direction: row; align-items: center; gap: 10px; }
            .check label { font-size: 14px; color: var(--primary-text-color); }
            .hint {
              font-size: 12px;
              color: var(--secondary-text-color);
              line-height: 1.45;
              margin: 0;
            }
            .group {
              border-top: 1px solid var(--divider-color, #e0e0e0);
              padding-top: 14px;
              display: flex;
              flex-direction: column;
              gap: 16px;
            }
            [hidden] { display: none !important; }
          </style>
          <div class="form">
            <div class="row">
              <label for="mode">Where the colors come from</label>
              <select id="mode">
                <option value="sensor">Home Assistant sensor (recommended)</option>
                <option value="direct">Call the ESB Lights API directly</option>
              </select>
              <p class="hint" id="modeHint"></p>
            </div>

            <div class="row" id="sensorRow">
              <label for="entity">Sensor</label>
              <input type="text" id="entity" list="esbEntities" placeholder="sensor.esb_light_color">
              <datalist id="esbEntities"></datalist>
            </div>

            <div id="directRows" class="group" hidden>
              <div class="row">
                <label for="apiUrl">API address</label>
                <input type="text" id="apiUrl" placeholder="http://192.168.123.114:4000">
                <p class="hint">Base address only, no path. The card appends /api/esb-light-data.</p>
              </div>
              <div class="row">
                <label for="apiKey">API key</label>
                <input type="password" id="apiKey" placeholder="optional">
              </div>
              <div class="row">
                <label for="refresh">Refresh every (seconds)</label>
                <input type="number" id="refresh" min="60" step="60" placeholder="3600">
              </div>
            </div>

            <div class="group">
              <div class="row check">
                <input type="checkbox" id="showReason">
                <label for="showReason">Show the occasion</label>
              </div>
              <div class="row check">
                <input type="checkbox" id="showHex">
                <label for="showHex">Show hex codes on the swatches</label>
              </div>
              <div class="row">
                <label for="height">Swatch height (px)</label>
                <input type="number" id="height" min="80" step="10" placeholder="250">
              </div>
            </div>
          </div>`;

        const $ = (id) => this.shadowRoot.getElementById(id);

        $("mode").addEventListener("change", (e) =>
        {
            this._modeValue = e.target.value;

            if (e.target.value === "sensor")
            {
                //Drop the direct-mode keys entirely rather than leaving them stale
                delete this._config.api_url;
                delete this._config.api_key;
                delete this._config.refresh_seconds;
                this._config.entity = this._config.entity || "sensor.esb_light_color";
            }
            else
            {
                delete this._config.entity;
                this._config.api_url = this._config.api_url || "";
            }
            this._sync();
            this._emit();
        });

        const bindText = (id, key, transform) =>
        {
            $(id).addEventListener("input", (e) =>
            {
                const value = e.target.value.trim();
                if (value === "")
                {
                    delete this._config[key];
                }
                else
                {
                    this._config[key] = transform ? transform(value) : value;
                }
                this._emit();
            });
        };

        bindText("entity", "entity");
        bindText("apiUrl", "api_url");
        bindText("apiKey", "api_key");
        bindText("refresh", "refresh_seconds", Number);
        bindText("height", "height", Number);

        const bindCheck = (id, key) =>
        {
            $(id).addEventListener("change", (e) =>
            {
                this._config[key] = e.target.checked;
                this._emit();
            });
        };

        bindCheck("showReason", "show_reason");
        bindCheck("showHex", "show_hex");
    }

    _fillEntities()
    {
        if (!this._hass || !this._built)
        {
            return;
        }

        const list = this.shadowRoot.getElementById("esbEntities");
        if (!list || list.dataset.filled === "yes")
        {
            return;
        }

        //Offer every sensor that looks like it carries hex codes, then all sensors
        const ids = Object.keys(this._hass.states).filter((id) => id.startsWith("sensor."));
        const preferred = ids.filter((id) => this._hass.states[id].attributes.hexCodes);
        const ordered = preferred.concat(ids.filter((id) => !preferred.includes(id)));

        list.innerHTML = ordered.map((id) => `<option value="${id}"></option>`).join("");
        list.dataset.filled = "yes";
    }

    _sync()
    {
        if (!this._built)
        {
            return;
        }

        const $ = (id) => this.shadowRoot.getElementById(id);
        const mode = this._mode();

        $("mode").value = mode;
        $("sensorRow").hidden = mode !== "sensor";
        $("directRows").hidden = mode !== "direct";
        $("modeHint").textContent = mode === "sensor"
            ? "Home Assistant fetches server-side, so the card also works away from the office."
            : "The browser viewing the dashboard fetches directly, so it only works on a network that can reach the API.";

        $("entity").value = this._config.entity || "";
        $("apiUrl").value = this._config.api_url || "";
        $("apiKey").value = this._config.api_key || "";
        $("refresh").value = this._config.refresh_seconds || "";
        $("height").value = this._config.height || "";
        $("showReason").checked = this._config.show_reason !== false;
        $("showHex").checked = this._config.show_hex !== false;
    }
}

customElements.define("esb-lights-card", EsbLightsCard);
customElements.define("esb-lights-card-editor", EsbLightsCardEditor);

//Puts the card in the dashboard "add card" picker
window.customCards = window.customCards || [];
window.customCards.push({
    type: "esb-lights-card",
    name: "ESB Lights",
    description: "Tonight's Empire State Building color scheme",
    preview: true,
    documentationURL: "https://github.com/KineticTeam/esblights-card",
});

console.info(`%c ESB-LIGHTS-CARD %c ${CARD_VERSION} `,
    "color:#fff;background:#00ADEF;font-weight:700",
    "color:#00ADEF;background:transparent");
