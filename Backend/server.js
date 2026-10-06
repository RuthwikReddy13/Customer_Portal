const express = require("express");
const axios = require("axios");
const cors = require("cors");
const xml2js = require("xml2js");

const app = express();

const SAP_BASE = "http://AZKTLDS5CP.kcloud.com:8000";
const AUTH = {
  username: "K901945",
  password: "AhalRavi@258",
};

app.use(cors());
app.use(express.json());

const parser = new xml2js.Parser({
  explicitArray: false,
  ignoreAttrs: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

// ─── SOAP HELPER ─────────────────────────────────────────────
function buildSoapEnvelope(bodyContent) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soapenv:Header/>
  <soapenv:Body>
    ${bodyContent}
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ─── CACHE SYSTEM ────────────────────────────────────────────
const SAP_CACHE = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (adjust if needed)

// ─── SAP CALLER ──────────────────────────────────────────────
async function callSapService(path, soapBody, action) {
  try {
    const cacheKey = path + soapBody;
    const cachedRecord = SAP_CACHE[cacheKey];
    if (cachedRecord && (Date.now() - cachedRecord.time < CACHE_TTL_MS)) {
      console.log("\n⚡ SERVING FROM FAST CACHE (0ms):", path);
      return cachedRecord.data;
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📤 SAP CALL:", path);
    console.log("📋 ACTION:", action);
    console.log("📝 BODY:\n", soapBody);

    const response = await axios({
      method: "POST",
      url: `${SAP_BASE}${path}`,
      data: soapBody,
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": action,
      },
      auth: AUTH,
      timeout: 20000,
    });

    console.log("📥 RAW RESPONSE:\n", response.data);

    const parsed = await parser.parseStringPromise(response.data);

    if (parsed?.Envelope?.Body?.Fault) {
      const fault = parsed.Envelope.Body.Fault;
      console.error("❌ SOAP FAULT:");
      console.error("   Code:", fault.faultcode);
      console.error("   Message:", fault.faultstring);
      throw new Error(fault.faultstring);
    }

    const body = parsed?.Envelope?.Body;
    const keys = Object.keys(body || {}).filter(k => k !== "$");
    console.log("✅ PARSED RESPONSE KEYS:", keys);
    console.log("✅ PARSED DATA:", JSON.stringify(body, null, 2));

    // Save response to fast cache
    SAP_CACHE[cacheKey] = {
      time: Date.now(),
      data: parsed
    };

    return parsed;

  } catch (error) {
    if (error.response) {
      console.error("❌ HTTP STATUS:", error.response.status);
      console.error("❌ HTTP RESPONSE:\n", error.response.data);
    } else {
      console.error("❌ ERROR:", error.message);
    }
    throw error;
  }
}

// ─── RESPONSE EXTRACTOR ──────────────────────────────────────
function extractResponse(parsed) {
  const body = parsed?.Envelope?.Body;
  if (!body) return null;
  const keys = Object.keys(body).filter((k) => k !== "$");
  return keys.length === 1 ? body[keys[0]] : body;
}

// ─── LOGIN ───────────────────────────────────────────────────
app.post("/login", async (req, res) => {
  const { customer_id, password } = req.body;
  console.log("\n🔐 LOGIN ATTEMPT for:", customer_id);

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_login_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_LOGIN_AR05>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
          <IV_PASSWORD>${password}</IV_PASSWORD>
        </urn:ZFM_CUST_LOGIN_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_LOGIN_AR05"
    );

    const data = extractResponse(result);
    console.log("✅ Login result:", data);

    res.json({
      status: data?.EV_STATUS || "E",
      message: data?.EV_MESSAGE || "Login failed",
    });

  } catch (error) {
    console.error("❌ Login failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── SALES ───────────────────────────────────────────────────
// ─── SALES ───────────────────────────────────────────────────
app.get("/sales", async (req, res) => {
  const { customer_id } = req.query;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 SALES REQUEST");
  console.log("Customer ID:", customer_id);

  if (!customer_id) {
    console.log("❌ Missing customer_id");
    return res.status(400).json({ error: "customer_id required" });
  }

  try {
    console.log("📤 Calling SAP SALES...");

    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_dbdsales_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_DBDSALES_AR05>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
        </urn:ZFM_CUST_DBDSALES_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_DBDSALES_AR05"
    );

    console.log("✅ RAW PARSED RESULT:");
    console.log(JSON.stringify(result, null, 2));

    const data = extractResponse(result);

    console.log("✅ EXTRACTED RESPONSE:");
    console.log(JSON.stringify(data, null, 2));

    const items = data?.ET_DASH?.item;

    console.log("✅ SALES ITEMS:");
    console.log(items);

    res.json(data);

  } catch (err) {
    console.error("❌ SALES ERROR:");
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── FINANCE ─────────────────────────────────────────────────
app.get("/finance", async (req, res) => {
  const { customer_id } = req.query;
  console.log("\n💰 FINANCE REQUEST for:", customer_id);

  if (!customer_id) return res.status(400).json({ error: "customer_id required" });

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_finance_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_FINANCE_AR05>
         <ET_FIN/>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
        </urn:ZFM_CUST_FINANCE_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_FINANCE_AR05"
    );
    res.json(extractResponse(result));
  } catch (err) {
    console.error("❌ Finance error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELIVERY ────────────────────────────────────────────────
app.get("/delivery", async (req, res) => {
  const { customer_id } = req.query;
  console.log("\n🚚 DELIVERY REQUEST for:", customer_id);

  if (!customer_id) return res.status(400).json({ error: "customer_id required" });

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_delivery_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_DELIVERY_AR05>
          <ET_DELIVERY/>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
        </urn:ZFM_CUST_DELIVERY_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_DELIVERY_AR05"
    );
    const data = extractResponse(result);
    console.log("✅ Delivery data keys:", Object.keys(data || {}));
    res.json(data);
  } catch (err) {
    console.error("❌ Delivery error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── INVOICE ─────────────────────────────────────────────────
app.get("/invoice", async (req, res) => {
  const { customer_id } = req.query;
  console.log("\n🧾 INVOICE REQUEST for:", customer_id);

  if (!customer_id) return res.status(400).json({ error: "customer_id required" });

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_invoice_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_INVOICE_AR05>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
        </urn:ZFM_CUST_INVOICE_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_INVOICE_AR05"
    );
    res.json(extractResponse(result));
  } catch (err) {
    console.error("❌ Invoice error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── INVOICE PDF ─────────────────────────────────────────────
app.get("/invoice/pdf", async (req, res) => {
  const { vbeln } = req.query;
  console.log("\n📄 INVOICE PDF REQUEST for:", vbeln);

  if (!vbeln) return res.status(400).json({ error: "vbeln required" });

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_inv_api_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_INV_API_AR05>
          <IV_VBELN>${vbeln}</IV_VBELN>
        </urn:ZFM_CUST_INV_API_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_INV_API_AR05"
    );

    const data = extractResponse(result);
    // Returns data containing EV_BASE64
    console.log('📦 Sending PDF data to frontend. Keys:', Object.keys(data || {}));
    res.json(data);

  } catch (err) {
    console.error("❌ Invoice PDF error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── MEMO ────────────────────────────────────────────────────
app.get("/memo", async (req, res) => {
  const { customer_id } = req.query;
  console.log("\n📝 MEMO REQUEST for:", customer_id);

  if (!customer_id) return res.status(400).json({ error: "customer_id required" });

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_memo_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_MEMO_AR05>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
        </urn:ZFM_CUST_MEMO_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_MEMO_AR05"
    );
    res.json(extractResponse(result));
  } catch (err) {
    console.error("❌ Memo error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PROFILE ─────────────────────────────────────────────────
app.get("/profile", async (req, res) => {
  const { customer_id } = req.query;
  console.log("\n👤 PROFILE REQUEST for:", customer_id);

  if (!customer_id) return res.status(400).json({ error: "customer_id required" });

  try {
    const result = await callSapService(
      "/sap/bc/srt/scs/sap/zfm_cust_profile_ar05_srv?sap-client=100",
      buildSoapEnvelope(`
        <urn:ZFM_CUST_PROFILE_AR05>
          <IV_KUNNR>${customer_id}</IV_KUNNR>
        </urn:ZFM_CUST_PROFILE_AR05>
      `),
      "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_PROFILE_AR05"
    );
    res.json(extractResponse(result));
  } catch (err) {
    console.error("❌ Profile error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD OVERVIEW ─────────────────────────────────────
// ─── DASHBOARD OVERVIEW ─────────────────────────────────────
app.get("/dashboard/overview", async (req, res) => {
  const { customer_id } = req.query;
  console.log("\n📊 DASHBOARD OVERVIEW for:", customer_id);

  if (!customer_id)
    return res.status(400).json({ error: "customer_id required" });

  try {
    const safeCall = async (service, path, body, action) => {
      try {
        const raw = await callSapService(path, body, action);
        return extractResponse(raw);
      } catch (err) {
        console.error(`⚠️ FAILED SERVICE (${service}):`, err.message);
        return null;
      }
    };

    const [delivery, invoice, memo, sales, finance] = await Promise.all([
      safeCall("DELIVERY", "/sap/bc/srt/scs/sap/zfm_cust_delivery_ar05_srv?sap-client=100",
        buildSoapEnvelope(`<urn:ZFM_CUST_DELIVERY_AR05><ET_DELIVERY/><IV_KUNNR>${customer_id}</IV_KUNNR></urn:ZFM_CUST_DELIVERY_AR05>`),
        "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_DELIVERY_AR05"),

      safeCall("INVOICE", "/sap/bc/srt/scs/sap/zfm_cust_invoice_ar05_srv?sap-client=100",
        buildSoapEnvelope(`<urn:ZFM_CUST_INVOICE_AR05><IV_KUNNR>${customer_id}</IV_KUNNR></urn:ZFM_CUST_INVOICE_AR05>`),
        "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_INVOICE_AR05"),

      safeCall("MEMO", "/sap/bc/srt/scs/sap/zfm_cust_memo_ar05_srv?sap-client=100",
        buildSoapEnvelope(`<urn:ZFM_CUST_MEMO_AR05><IV_KUNNR>${customer_id}</IV_KUNNR></urn:ZFM_CUST_MEMO_AR05>`),
        "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_MEMO_AR05"),

      safeCall("SALES", "/sap/bc/srt/scs/sap/zfm_cust_dbdsales_ar05_srv?sap-client=100",
        buildSoapEnvelope(`<urn:ZFM_CUST_DBDSALES_AR05><IV_KUNNR>${customer_id}</IV_KUNNR></urn:ZFM_CUST_DBDSALES_AR05>`),
        "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_DBDSALES_AR05"),

      safeCall("FINANCE", "/sap/bc/srt/scs/sap/zfm_cust_finance_ar05_srv?sap-client=100",
        buildSoapEnvelope(`<urn:ZFM_CUST_FINANCE_AR05><ET_FIN/><IV_KUNNR>${customer_id}</IV_KUNNR></urn:ZFM_CUST_FINANCE_AR05>`),
        "urn:sap-com:document:sap:rfc:functions:ZFM_CUST_FINANCE_AR05"),
    ]);

    res.json({
      summaryCards: [
        {
          title: "Deliveries",
          value: delivery?.ET_DELIVERY?.item?.length || "0",
          icon: "truck",
          color: "primary",
        },
        {
          title: "Invoices",
          value: invoice?.ET_INVOICE?.item?.length || "0",
          icon: "receipt",
          color: "accent",
        },
        {
          title: "Memos",
          value: memo?.ET_MEMO?.item?.length || "0",
          icon: "file",
          color: "warn",
        },
      ],

      sales,
      finance,
      delivery,
      invoice,
      memo,
    });

  } catch (error) {
    console.error("❌ Dashboard error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── START ───────────────────────────────────────────────────
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});