const express = require("express");
const {
  createProxyMiddleware,
  responseInterceptor,
} = require("http-proxy-middleware");

const app = express();
const port = 9000;

app.get("/health", (req, res) => {
  res.send("ok");
});
app.use(
  "/",
  createProxyMiddleware({
    target: "https://www.guozaoke.com",
    changeOrigin: true,
    selfHandleResponse: true,
    proxyTimeout: 3000,
    timeout: 3000,
    onProxyRes: responseInterceptor(
      async (responseBuffer, proxyRes, req, res) => {
        const response = responseBuffer.toString("utf8"); // convert buffer to string
        if (proxyRes.statusCode === 302) {
          res.statusCode = 200;
          const location = proxyRes.headers["location"];
          res.removeHeader("location");
          res.setHeader("Content-type", "application/json");
          return JSON.stringify({
            statusCode: 302,
            location,
          });
        }
        return JSON.stringify({
          statusCode: proxyRes.statusCode,
          body: response,
        });
      },
    ),
  }),
);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
