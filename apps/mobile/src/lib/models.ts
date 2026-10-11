import { MODELS } from "@carelens/ml";

export { MODELS };

export const MODEL_ASSETS: Record<string, number> = {
  brain: require("../../assets/models/brain_model.tflite"),
  pneumonia: require("../../assets/models/newPneumoniaModel.tflite"),
  model: require("../../assets/models/model.tflite"),
  model_unquant: require("../../assets/models/model_unquant.tflite"),
  new_model: require("../../assets/models/new_model.tflite"),
};
