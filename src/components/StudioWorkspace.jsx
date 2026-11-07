import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, createAiHarness } from "ag-studio";
import { useEffect, useMemo, useState } from "react";
import { createTrustPalStudioAdapter } from "../studioAdapter.js";

export function StudioWorkspace({ data }) {
  const [licenseKey, setLicenseKey] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const ai = useMemo(() => {
    const adapter = createTrustPalStudioAdapter();
    return ({ api }) => createAiHarness(api, {
      adapter,
      models: [{ id: "gpt-5-6-terra", label: "Astropods · GPT-5.6 Terra" }],
      promptStarters: [
        { label: "Urgent education", prompt: "Build a view of education causes below 70% funded, ordered by deadline." },
        { label: "Money + skills", prompt: "Compare campaign funding gaps with open volunteer skill needs." },
        { label: "PayPal integrity", prompt: "Add a table of PayPal contributions with source, status, and webhook verification." },
      ],
    });
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/impact-api/studio-config", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : {})
      .then((config) => { if (active) setLicenseKey(config.licenseKey || null); })
      .catch(() => {})
      .finally(() => { if (active) setConfigLoaded(true); });
    return () => { active = false; };
  }, []);

  if (!configLoaded) return <div className="studio-loading">Applying the AG Studio licence…</div>;

  return (
    <AgStudioProvider modules={[AgStudioAiModule]} licenseKey={licenseKey || undefined}>
      <AgStudio data={data} mode="edit" studioId="trustpal-impact-studio" ai={ai} />
    </AgStudioProvider>
  );
}
