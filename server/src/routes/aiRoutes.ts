import { Router } from "express";

import { aiController } from "../controllers/aiController";

const router = Router();

router.post("/", aiController);

export default router;