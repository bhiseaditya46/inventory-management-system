import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import inventoryRouter from "./inventory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(inventoryRouter);

export default router;
