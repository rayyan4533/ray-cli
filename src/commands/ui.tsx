import { render } from "ink";
import { App, type AppProps } from "../ui/app/App.js";

export async function startUi(props: AppProps): Promise<void> {
  const app = render(<App {...props} />, { alternateScreen: true });
  await app.waitUntilExit();
}
