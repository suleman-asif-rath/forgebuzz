import { getSettings } from "@/lib/settings";
import Nav from "../nav";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <main className="wrap">
      <Nav />
      <SettingsForm initial={settings} />
    </main>
  );
}
