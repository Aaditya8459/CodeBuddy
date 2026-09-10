import { Router } from "express";

import {
  executeTerminalCommand,
  createTerminalSession,
  closeTerminalSession,
} from "../controllers/terminalController";

const router = Router();

router.post("/session", createTerminalSession);

router.post("/execute", executeTerminalCommand);

router.post("/close", closeTerminalSession);

export default router;