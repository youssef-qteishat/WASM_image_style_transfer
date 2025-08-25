// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";

export default function App() {
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [styles] = useState(["candy", "mosaic", "rain_princess"]); // example style IDs
  const [selectedStyle, setSelectedStyle] = useState(styles[0]);
  const [imageFile, setImageFile] = useState(null);

  const originalCanvasRef = useRef(null);
  const stylizedCanvasRef = useRef(null);

  // Load WASM from public/pkg
  useEffect(() => {
    const loadWasm = async () => {
      const jsUrl = "/pkg/WASM_image_style_transfer.js";
      const wasmUrl = "/pkg/WASM_image_style_transfer_bg.wasm";

      // Create <script type="module"> to load the wasm-bindgen JS
      const script = document.createElement("script");
      script.type = "module";
      script.src = jsUrl;

      script.onload = async () => {
        // `init` is the default export of wasm-bindgen
        await window["WASM_image_style_transfer"].default(wasmUrl);
        setWasmLoaded(true);
      };

      document.body.appendChild(script);
    };

    loadWasm();
  }, []);

  // Draw uploaded image to original canvas
  useEffect(() => {
    if (!imageFile || !originalCanvasRef.current) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = originalCanvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile]);

  const handleFileChange = (e) => {
    setImageFile(e.target.files[0]);
  };

  const handleStyleChange = (e) => {
    setSelectedStyle(e.target.value);
  };

  const handleStylize = async () => {
    if (!wasmLoaded || !originalCanvasRef.current || !stylizedCanvasRef.current) {
      alert("WASM not loaded yet!");
      return;
    }

    const origCanvas = originalCanvasRef.current;
    const ctx = origCanvas.getContext("2d");
    const { width, height } = origCanvas;
    const imageData = ctx.getImageData(0, 0, width, height);

    try {
      // `stylize_image` is exported from your wasm module
      const { stylize_image } = window["WASM_image_style_transfer"];
      const result = await stylize_image(
        new Uint8ClampedArray(imageData.data),
        width,
        height,
        selectedStyle,
        1.0 // full strength
      );

      const stylizedCanvas = stylizedCanvasRef.current;
      stylizedCanvas.width = width;
      stylizedCanvas.height = height;
      const stylCtx = stylizedCanvas.getContext("2d");
      const outputData = new ImageData(result, width, height);
      stylCtx.putImageData(outputData, 0, 0);
    } catch (err) {
      console.error("Error applying style:", err);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>WASM Image Style Transfer</h1>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      <select value={selectedStyle} onChange={handleStyleChange}>
        {styles.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button onClick={handleStylize} disabled={!wasmLoaded || !imageFile}>
        Stylize Image
      </button>

      <div style={{ display: "flex", marginTop: "20px", gap: "20px" }}>
        <div>
          <h3>Original</h3>
          <canvas ref={originalCanvasRef} style={{ border: "1px solid black" }} />
        </div>
        <div>
          <h3>Stylized</h3>
          <canvas ref={stylizedCanvasRef} style={{ border: "1px solid black" }} />
        </div>
      </div>
    </div>
  );
}