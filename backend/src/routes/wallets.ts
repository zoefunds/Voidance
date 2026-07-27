import { Router } from "express";
import { pool } from "../db/pool.js";

export const walletsRouter = Router();

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

walletsRouter.get("/:address/policies", async (req, res, next) => {
  try {
    const address = req.params.address.toLowerCase();
    if (!ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: "invalid wallet address" });
    }
    const [sponsored, researched] = await Promise.all([
      pool.query("SELECT id FROM policies WHERE lower(sponsor) = $1 ORDER BY id DESC", [address]),
      pool.query("SELECT id FROM policies WHERE lower(researcher) = $1 ORDER BY id DESC", [address]),
    ]);
    res.json({
      sponsored: sponsored.rows.map((r) => Number(r.id)),
      researched: researched.rows.map((r) => Number(r.id)),
    });
  } catch (err) {
    next(err);
  }
});
