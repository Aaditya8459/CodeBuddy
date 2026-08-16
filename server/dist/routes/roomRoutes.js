"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const roomController_1 = require("../controllers/roomController");
const router = express_1.default.Router();
// Ensure these point to the correct functions
router.post('/', roomController_1.createRoom);
router.post('/join', roomController_1.joinRoom);
exports.default = router;
//# sourceMappingURL=roomRoutes.js.map