import mongoose from "mongoose"; import BlockBase from "../block.model.js"
const TableBlockSchema = new mongoose.Schema(
  {
  
    headers: {
      type: [String],
      default: undefined,  
    },

    rows: {
      type: [
        {
          type: [String],  
          required: true,
        }
      ],
      required: true
    },

    order: {
      type: Number,
      required: true,
    }
  },
  { _id: false, minimize: true }
);

export const TableBlock = BlockBase.discriminator("table", TableBlockSchema);
export default TableBlockSchema;