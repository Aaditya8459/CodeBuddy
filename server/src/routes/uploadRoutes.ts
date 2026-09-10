import { Router } from "express";

import {
  upload,
  uploadFile,
} from "../controllers/uploadController";

const router = Router();

router.post(
  "/",
  upload.single("file"),
  uploadFile
);

export default router;