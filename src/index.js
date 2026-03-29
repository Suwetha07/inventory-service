const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/inventorydb';
mongoose.connect(MONGO_URI).then(() => console.log('Inventory Service: MongoDB connected')).catch(err => console.error(err));

const inventorySchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true },
  stock: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 },
  warehouse: { type: String, default: 'main' },
  lastUpdated: { type: Date, default: Date.now }
});
const Inventory = mongoose.model('Inventory', inventorySchema);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory-service' }));

// Get inventory for a product
app.get('/inventory/:productId', async (req, res) => {
  try {
    let inv = await Inventory.findOne({ productId: req.params.productId });
    if (!inv) inv = await Inventory.create({ productId: req.params.productId, stock: 0 });
    res.json(inv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update inventory
app.put('/inventory/:productId', async (req, res) => {
  try {
    const { stock } = req.body;
    const inv = await Inventory.findOneAndUpdate(
      { productId: req.params.productId },
      { stock, lastUpdated: Date.now() },
      { new: true, upsert: true }
    );
    res.json(inv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check stock availability
app.post('/inventory/check', async (req, res) => {
  try {
    const { items } = req.body; // [{productId, quantity}]
    const results = [];
    for (const item of items) {
      const inv = await Inventory.findOne({ productId: item.productId });
      const available = inv ? inv.stock - inv.reserved >= item.quantity : false;
      results.push({ productId: item.productId, requested: item.quantity, available, stock: inv?.stock || 0 });
    }
    const allAvailable = results.every(r => r.available);
    res.json({ allAvailable, items: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reserve stock
app.post('/inventory/reserve', async (req, res) => {
  try {
    const { items } = req.body;
    for (const item of items) {
      await Inventory.findOneAndUpdate(
        { productId: item.productId },
        { $inc: { reserved: item.quantity } }
      );
    }
    res.json({ reserved: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Release reserved stock
app.post('/inventory/release', async (req, res) => {
  try {
    const { items } = req.body;
    for (const item of items) {
      await Inventory.findOneAndUpdate(
        { productId: item.productId },
        { $inc: { reserved: -item.quantity, stock: -item.quantity } }
      );
    }
    res.json({ released: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all inventory
app.get('/inventory', async (req, res) => {
  try {
    const inventory = await Inventory.find();
    res.json(inventory);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`Inventory Service running on port ${PORT}`));
