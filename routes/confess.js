
import express from "express";
import Confession from "../models/Confession.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    const newConfess = new Confession({ message });
    const saved = await newConfess.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de l'enregistrement" });
  }
});

router.get("/", async (req, res) => {
  try {
    const confessions = await Confession.find().sort({ timestamp: -1 });
    res.json(confessions);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de la récupération" });
  }
});

export default router;
