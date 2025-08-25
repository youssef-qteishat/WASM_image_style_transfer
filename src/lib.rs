// backend/src/lib.rs
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use js_sys::{Float32Array, Uint8ClampedArray};
use gloo_console::log;

// Import the JS shim that will load ONNX models and run them on WebGPU.
// file path is relative to your frontend/public/src mapping; adjust as needed.
#[wasm_bindgen(module = "/frontend/src/onnx_shim.js")]
extern "C" {
    fn run_onnx_model(
        style_id: &str,
        input: &Float32Array,
        n: u32,
        c: u32,
        h: u32,
        w: u32,
    ) -> js_sys::Promise;
}

#[wasm_bindgen]
pub fn greet() {
    log!("wasm backend loaded");
}

/// Main entrypoint exported to JS/React.
/// - `rgba_in` : Uint8ClampedArray from canvas.getImageData().data
/// - `width`, `height` : canvas dimensions
/// - `style_id` : string id from your registry (e.g., "candy")
/// - `strength` : 0.0..1.0 blend factor (0 = original, 1 = full stylized)
#[wasm_bindgen]
pub async fn stylize_image(
    rgba_in: Uint8ClampedArray,
    width: u32,
    height: u32,
    style_id: String,
    strength: f32,
) -> Result<Uint8ClampedArray, JsValue> {
    // Step 1: convert RGBA (NHWC) -> NCHW Float32 [0,1]
    let nchw = rgba_to_nchw(&rgba_in, width as usize, height as usize);

    // create JS Float32Array view to pass to JS shim
    let js_input = Float32Array::from(nchw.as_slice());

    // Step 2: call JS shim to run the ONNX model on WebGPU
    // run_onnx_model returns a Promise that resolves to a Float32Array (NCHW float32)
    let promise = run_onnx_model(&style_id, &js_input, 1, 3, height, width);
    let js_value = JsFuture::from(promise).await?; // await JS promise
    // Convert returned JsValue into Float32Array
    let out_f32 = Float32Array::new(&js_value);

    // Step 3: convert model output (NCHW float32 [0,1]) -> RGBA u8 (Vec<u8>)
    let stylized_rgba_vec = nchw_to_rgba_vec(&out_f32, width as usize, height as usize);

    // Step 4: blend with original depending on strength
    let blended = blend_with_original(&rgba_in, &stylized_rgba_vec, strength);

    // Step 5: return Uint8ClampedArray back to JavaScript
    Ok(Uint8ClampedArray::from(blended.as_slice()))
}

/* -------------------- helper functions -------------------- */

fn rgba_to_nchw(rgba: &Uint8ClampedArray, w: usize, h: usize) -> Vec<f32> {
    let size = w * h;
    let mut out = vec![0f32; 3 * size];
    for i in 0..size {
        let r = rgba.get_index((i * 4) as u32) as f32 / 255.0;
        let g = rgba.get_index((i * 4 + 1) as u32) as f32 / 255.0;
        let b = rgba.get_index((i * 4 + 2) as u32) as f32 / 255.0;
        out[i] = r;
        out[i + size] = g;
        out[i + 2 * size] = b;
    }
    out
}

fn nchw_to_rgba_vec(f32_arr: &Float32Array, w: usize, h: usize) -> Vec<u8> {
    let size = w * h;
    let mut out = vec![0u8; size * 4];
    // Float32Array provides length in number of floats
    for i in 0..size {
        let r = (f32_arr.get_index(i as u32) * 255.0).clamp(0.0, 255.0) as u8;
        let g = (f32_arr.get_index((i + size) as u32) * 255.0).clamp(0.0, 255.0) as u8;
        let b = (f32_arr.get_index((i + 2 * size) as u32) * 255.0).clamp(0.0, 255.0) as u8;
        let idx = i * 4;
        out[idx] = r;
        out[idx + 1] = g;
        out[idx + 2] = b;
        out[idx + 3] = 255;
    }
    out
}

/// Blend rust-side: blended = (1 - s)*orig + s*stylized
fn blend_with_original(orig: &Uint8ClampedArray, styl: &Vec<u8>, s: f32) -> Vec<u8> {
    let len = styl.len();
    let mut out = vec![0u8; len];
    let s1 = 1.0 - s;
    for i in (0..len).step_by(4) {
        let or = orig.get_index(i as u32) as f32;
        let og = orig.get_index((i + 1) as u32) as f32;
        let ob = orig.get_index((i + 2) as u32) as f32;

        let sr = styl[i] as f32;
        let sg = styl[i + 1] as f32;
        let sb = styl[i + 2] as f32;

        out[i] = (s1 * or + s * sr).round().clamp(0.0, 255.0) as u8;
        out[i + 1] = (s1 * og + s * sg).round().clamp(0.0, 255.0) as u8;
        out[i + 2] = (s1 * ob + s * sb).round().clamp(0.0, 255.0) as u8;
        out[i + 3] = 255;
    }
    out
}