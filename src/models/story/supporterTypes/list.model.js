import mongoose from "mongoose";  import BlockBase from "../block.model.js"
 
const ListItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    style: {
      bold: { type: Boolean },
      italic: { type: Boolean },
      underline: { type: Boolean }
    }
  },
  { _id: false, minimize: true }
);

 
const ListBlockSchema = new mongoose.Schema(
  {
     
    ordered: {
      type: Boolean,
      default: false,  
    },

    items: {
      type: [ListItemSchema],
      required: true,
      validate: v => Array.isArray(v) && v.length > 0
    },

    order: {
      type: Number,
      required: true,
    },
  },
  { _id: false, minimize: true }
);
export const ListBlock = BlockBase.discriminator("list", ListBlockSchema);
export default ListBlockSchema;