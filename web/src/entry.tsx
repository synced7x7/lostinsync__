// Web entry point: start the cloud-sync engine, then boot the unchanged app.
import "./cloud.css";
import { init } from "./sync";

void init();
import("../../src/main");
