let sdkPromise;

export function loadPayPalSdk(environment = "sandbox") {
  if (environment !== "sandbox") {
    return Promise.reject(new Error("TrustPal's public hackathon demo only supports PayPal Sandbox."));
  }
  if (window.paypal?.createInstance) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "paypal-web-sdk-v6";
    script.async = true;
    script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.onload = () => window.paypal?.createInstance
      ? resolve(window.paypal)
      : reject(new Error("PayPal SDK loaded without createInstance."));
    script.onerror = () => reject(new Error("PayPal SDK could not be loaded."));
    document.head.appendChild(script);
  });

  return sdkPromise;
}
