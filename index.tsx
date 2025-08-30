import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Declaración para la librería de conversión HEIC
declare const heic2any: any;

// Constantes de Filtros
const FILTERS = {
  MOTION_BLUR: 'Desenfoque de Movimiento',
  PORTRAIT_BLUR_AI: 'Desenfoque de Retrato (IA)',
  TEXT_OVERLAY: 'Superposición de Texto',
  STRUCTURE: 'Análisis Estructural',
};

// Componente Principal de la Aplicación
const App = () => {
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>(FILTERS.MOTION_BLUR);
  const [filterSettings, setFilterSettings] = useState<any>({
    motionBlur: { pointX: 50, pointY: 50, intensity: 15 },
    depthBlur: { intensity: 8, maskPath: null, analyzing: false },
    textOverlay: { text: 'Tu texto aquí', blur: false },
    structure: { complexity: 50, dynamism: 30, fragmentation: 20, color: '#000000', points: [] },
  });
  const [colorSettings, setColorSettings] = useState({ saturation: 100, contrast: 100, exposure: 100 });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [framingOption, setFramingOption] = useState<string>('original');
  const [framingSettings, setFramingSettings] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [isFramingOpen, setIsFramingOpen] = useState(true);
  const [isColorOpen, setIsColorOpen] = useState(true);
  const [isHalftoneOpen, setIsHalftoneOpen] = useState(false);
  const [isHalftoneEnabled, setIsHalftoneEnabled] = useState(false);
  const [halftoneSettings, setHalftoneSettings] = useState({ dotSize: 8, spacing: 8 });
  const [customFont, setCustomFont] = useState<{ name: string; url: string | null }>({ name: "'Necto Mono', monospace", url: null });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(new Image());

  // Manejo de subida de archivo
  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    let file = files[0];
    const fileName = file.name.toLowerCase();

    // Comprobar y convertir archivos HEIC/HEIF
    if (fileName.endsWith('.heic') || fileName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      setIsLoading(true);
      setLoadingMessage('Convirtiendo imagen HEIC...');
      try {
        const conversionResult = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9,
        });
        
        const convertedBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;

        file = new File([convertedBlob], fileName.replace(/\.(heic|heif)$/, '.jpeg'), {
            type: 'image/jpeg',
            lastModified: new Date().getTime(),
        });
      } catch (error) {
        console.error("Error convirtiendo archivo HEIC:", error);
        alert("Hubo un error al convertir el archivo HEIC. Por favor, intenta con otro formato.");
        setIsLoading(false);
        setLoadingMessage('');
        return;
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    }

    if (file.type.startsWith('image/')) {
      // Reiniciar puntos y reencuadre al cargar nueva imagen
      updateSettings('structure', { points: [] });
      updateSettings('depthBlur', { maskPath: null });
      handleFramingChange('original');
      setImage(file);
      setImageUrl(URL.createObjectURL(file));
    } else {
        alert("Por favor, sube un archivo de imagen válido (JPG, PNG, HEIC, etc.).");
    }
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('border-black');
    handleFileChange(e.dataTransfer.files);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('border-black');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('border-black');
  };

  const updateSettings = (filter: string, newSettings: any) => {
    setFilterSettings((prev: any) => ({
      ...prev,
      [filter]: { ...prev[filter], ...newSettings },
    }));
  };

  // Función refactorizada para aplicar todos los efectos a un canvas
  const applyAllEffects = useCallback((targetCanvas: HTMLCanvasElement, sourceImage: HTMLImageElement, scaleToFit: boolean, framing: string) => {
    const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !sourceImage.src || sourceImage.naturalWidth === 0) return;

    const { scale, offsetX, offsetY } = framingSettings;

    // --- Lógica de Reencuadre ---
    let sWidth = sourceImage.naturalWidth;
    let sHeight = sourceImage.naturalHeight;
    let sx = 0;
    let sy = 0;

    if (framing !== 'original') {
        const aspectRatios: { [key: string]: number } = {
          '16:9': 16 / 9,
          '9:16': 9 / 16,
          '3:4': 3 / 4,
        };
        const targetAspectRatio = aspectRatios[framing];
        const sourceAspectRatio = sourceImage.naturalWidth / sourceImage.naturalHeight;
    
        let baseSWidth, baseSHeight;
    
        if (sourceAspectRatio > targetAspectRatio) {
            baseSHeight = sourceImage.naturalHeight;
            baseSWidth = sourceImage.naturalHeight * targetAspectRatio;
        } else {
            baseSWidth = sourceImage.naturalWidth;
            baseSHeight = sourceImage.naturalWidth / targetAspectRatio;
        }
    
        sWidth = baseSWidth / scale;
        sHeight = baseSHeight / scale;
    
        const pannableWidth = sourceImage.naturalWidth - sWidth;
        const pannableHeight = sourceImage.naturalHeight - sHeight;
    
        sx = (pannableWidth / 2) * (1 + offsetX / 100);
        sy = (pannableHeight / 2) * (1 + offsetY / 100);
    
        sx = isNaN(sx) ? 0 : sx;
        sy = isNaN(sy) ? 0 : sy;
    }
    // --- Fin Lógica de Reencuadre ---

    // 1. Establecer dimensiones del canvas
    if (scaleToFit) {
        const parent = targetCanvas.parentElement;
        if (!parent) return;

        const containerAspectRatio = parent.clientWidth / parent.clientHeight;
        const sAspectRatio = sWidth / sHeight;
        
        let ratio;
        if (containerAspectRatio > sAspectRatio) {
            ratio = parent.clientHeight / sHeight;
        } else {
            ratio = parent.clientWidth / sWidth;
        }
        ratio = Math.min(ratio, 1);

        targetCanvas.width = sWidth * ratio;
        targetCanvas.height = sHeight * ratio;
    } else {
        switch(framing) {
            case '16:9':
                targetCanvas.width = 1920;
                targetCanvas.height = 1080;
                break;
            case '9:16':
                targetCanvas.width = 1080;
                targetCanvas.height = 1920;
                break;
            case '3:4':
                targetCanvas.width = 1080;
                targetCanvas.height = 1440;
                break;
            default: // original
                targetCanvas.width = sWidth;
                targetCanvas.height = sHeight;
        }
    }
    
    // 2. Dibujar imagen base (con recorte)
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(sourceImage, sx, sy, sWidth, sHeight, 0, 0, targetCanvas.width, targetCanvas.height);

    // 2.1 Aplicar ajustes de color
    const { saturation, contrast, exposure } = colorSettings;
    const exposureValue = exposure / 100;
    
    // Crear canvas temporal para manipulación
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if(!tempCtx) return;
    tempCanvas.width = targetCanvas.width;
    tempCanvas.height = targetCanvas.height;

    // Aplicar filtros de saturación y contraste
    tempCtx.filter = `saturate(${saturation}%) contrast(${contrast}%)`;
    tempCtx.drawImage(targetCanvas, 0, 0);
    tempCtx.filter = 'none';

    // Aplicar exposición con recuperación de altas luces
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;

        r *= exposureValue;
        g *= exposureValue;
        b *= exposureValue;
        
        // Highlight compression
        r = r / (r + 1);
        g = g / (g + 1);
        b = b / (b + 1);

        data[i] = r * 255;
        data[i + 1] = g * 255;
        data[i + 2] = b * 255;
    }
    ctx.putImageData(imageData, 0, 0);

    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(targetCanvas, 0, 0);

    ctx.save();
    
    // 3. Aplicar filtro activo
    switch (activeFilter) {
      case FILTERS.MOTION_BLUR:
        const { pointX, pointY, intensity } = filterSettings.motionBlur;
        
        const blurCanvas = document.createElement('canvas');
        const blurCtx = blurCanvas.getContext('2d');
        if (!blurCtx) break;
        blurCanvas.width = targetCanvas.width;
        blurCanvas.height = targetCanvas.height;

        const numDraws = Math.max(2, Math.floor(intensity / 2));
        const blurAmount = intensity * 0.75;
        blurCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        blurCtx.globalAlpha = 1 / numDraws;
        for(let i = 0; i < numDraws; i++) {
          const offset = (i / (numDraws - 1) - 0.5) * blurAmount * 2;
          blurCtx.drawImage(tempCanvas, offset, 0);
        }
        blurCtx.globalAlpha = 1;
        
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(tempCanvas, 0, 0);

        const maskCanvas = document.createElement('canvas');
        const maskCtx = maskCanvas.getContext('2d');
        if (!maskCtx) break;
        maskCanvas.width = targetCanvas.width;
        maskCanvas.height = targetCanvas.height;

        const focusCenterX = targetCanvas.width * (pointX / 100);
        const focusCenterY = targetCanvas.height * (pointY / 100);
        const focusRadiusX = targetCanvas.width * 0.15;
        const focusRadiusY = targetCanvas.height * 0.4;
        
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
        maskCtx.globalCompositeOperation = 'destination-out';

        const sharpEllipseCanvas = document.createElement('canvas');
        const sharpEllipseCtx = sharpEllipseCanvas.getContext('2d');
        if(!sharpEllipseCtx) break;
        sharpEllipseCanvas.width = targetCanvas.width;
        sharpEllipseCanvas.height = targetCanvas.height;
        sharpEllipseCtx.fillStyle = 'black';
        sharpEllipseCtx.beginPath();
        sharpEllipseCtx.ellipse(focusCenterX, focusCenterY, focusRadiusX, focusRadiusY, 0, 0, 2 * Math.PI);
        sharpEllipseCtx.fill();
        
        maskCtx.filter = 'blur(25px)';
        maskCtx.drawImage(sharpEllipseCanvas, 0, 0);
        maskCtx.filter = 'none';

        const maskedBlurCanvas = document.createElement('canvas');
        const maskedBlurCtx = maskedBlurCanvas.getContext('2d');
        if (!maskedBlurCtx) break;
        maskedBlurCanvas.width = targetCanvas.width;
        maskedBlurCanvas.height = targetCanvas.height;
        maskedBlurCtx.drawImage(blurCanvas, 0, 0);
        maskedBlurCtx.globalCompositeOperation = 'destination-in';
        maskedBlurCtx.drawImage(maskCanvas, 0, 0);

        ctx.drawImage(maskedBlurCanvas, 0, 0);
        break;

      case FILTERS.PORTRAIT_BLUR_AI:
        const { intensity: depthIntensity, maskPath } = filterSettings.depthBlur;

        if (!maskPath) {
            // Si no hay máscara, simplemente dibuja la imagen original sin desenfoque
            ctx.drawImage(tempCanvas, 0, 0);
        } else {
            // Lógica de desenfoque con máscara
            ctx.save();
            
            // 1. Dibuja la versión desenfocada en todo el canvas
            ctx.filter = `blur(${depthIntensity}px)`;
            ctx.drawImage(tempCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
            ctx.filter = 'none';

            // 2. Crea un clip a partir de la ruta SVG
            const path = new Path2D(maskPath);
            const scaleX = targetCanvas.width / 100;
            const scaleY = targetCanvas.height / 100;
            // Declaración explícita del tipo para la matriz
            const matrix: DOMMatrixInit = { m11: scaleX, m12: 0, m21: 0, m22: scaleY, m41: 0, m42: 0 };
            const scaledPath = new Path2D();
            scaledPath.addPath(path, matrix);
            ctx.clip(scaledPath);

            // 3. Dibuja la imagen nítida original encima, que solo aparecerá dentro del clip
            ctx.drawImage(tempCanvas, 0, 0);
            
            ctx.restore(); // Restaura el contexto para eliminar el clip
        }
        break;

      case FILTERS.TEXT_OVERLAY:
          const { text, blur } = filterSettings.textOverlay;
          ctx.filter = blur ? `blur(2px)` : 'none';
          const fontSize = Math.max(24, targetCanvas.width / 25);
          ctx.font = `bold ${fontSize}px ${customFont.name}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'white';
          // Se elimina el borde (strokeStyle, lineWidth, strokeText)
          const words = text.split(/\s+/);
          words.forEach(word => {
              if(word.length === 0) return;
              const x = Math.random() * targetCanvas.width;
              const y = Math.random() * targetCanvas.height;
              ctx.fillText(word, x, y);
          });
          break;
      case FILTERS.STRUCTURE:
        const { points, color, complexity, dynamism, fragmentation } = filterSettings.structure;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(0.5, targetCanvas.width / 800);
        const pointSize = Math.max(1, targetCanvas.width / 300);
        const textFontSize = Math.max(8, targetCanvas.width / 100);
        ctx.font = `${textFontSize}px monospace`;
        ctx.textAlign = 'left';

        const pointsToDraw = points.filter((_: any, i: number) => i < points.length * (complexity / 100));

        const codeSnippets = ["let main = () =>", "for(;;)", `p${Math.round(Math.random() * 1000)}`, `v = ${Math.random().toFixed(3)}`, "init()", "draw()", `0x${Math.floor(Math.random() * 255).toString(16)}`, "await promise", "=> {}", `[${Math.floor(Math.random()*10)}]`, "err: null"];

        if (pointsToDraw.length > 1) {
            for (let i = 0; i < pointsToDraw.length; i++) {
                const p1 = { x: pointsToDraw[i].x * targetCanvas.width, y: pointsToDraw[i].y * targetCanvas.height };

                ctx.beginPath();
                ctx.arc(p1.x, p1.y, pointSize, 0, 2 * Math.PI);
                ctx.fill();

                if (Math.random() < complexity / 150) {
                    const snippet = codeSnippets[Math.floor(Math.random() * codeSnippets.length)];
                    ctx.fillText(snippet, p1.x + pointSize * 2, p1.y);
                }

                const connections = Math.min(Math.ceil(complexity / 33), pointsToDraw.length - 1);
                for (let j = 0; j < connections; j++) {
                    let connectIndex = Math.floor(Math.random() * pointsToDraw.length);
                    if (connectIndex === i) connectIndex = (connectIndex + 1) % pointsToDraw.length;
                    
                    const p2 = { x: pointsToDraw[connectIndex].x * targetCanvas.width, y: pointsToDraw[connectIndex].y * targetCanvas.height };
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);

                    if (dynamism > 10 && Math.random() < dynamism / 100) {
                        const midX = (p1.x + p2.x) / 2;
                        const midY = (p1.y + p2.y) / 2;
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const offset = (dynamism / 100) * dist * (Math.random() - 0.5) * 0.8;
                        const ctrlX = midX - (dy / dist) * offset;
                        const ctrlY = midY + (dx / dist) * offset;
                        ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y);
                    } else {
                        ctx.lineTo(p2.x, p2.y);
                    }
                    ctx.stroke();
                }
            }
        }

        const numParticles = Math.floor((fragmentation / 100) * 5000 * (targetCanvas.width / 1920));
        ctx.globalAlpha = 0.7;
        for (let i = 0; i < numParticles; i++) {
            const x = Math.random() * targetCanvas.width;
            const y = Math.random() * targetCanvas.height;
            const size = Math.random() * 1.5;
            ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1.0;
        break;
    }
    ctx.restore();

    // 4. Aplicar Semitono
    if (isHalftoneEnabled) {
        const { dotSize, spacing } = halftoneSettings;
        if (spacing > 0) {
            const imageData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
            const data = imageData.data;
            const width = targetCanvas.width;
            const height = targetCanvas.height;
    
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'black';
    
            for (let y = 0; y < height; y += spacing) {
                for (let x = 0; x < width; x += spacing) {
                    let totalBrightness = 0;
                    let pixelCount = 0;
                    for (let blockY = y; blockY < y + spacing && blockY < height; blockY++) {
                        for (let blockX = x; blockX < x + spacing && blockX < width; blockX++) {
                            const index = (blockY * width + blockX) * 4;
                            const r = data[index];
                            const g = data[index + 1];
                            const b = data[index + 2];
                            totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
                            pixelCount++;
                        }
                    }
            
                    const avgBrightness = (totalBrightness / pixelCount) / 255;
                    const radius = (dotSize / 2) * (1 - avgBrightness);
            
                    if (radius > 0) {
                        ctx.beginPath();
                        ctx.arc(x + spacing / 2, y + spacing / 2, radius, 0, 2 * Math.PI, true);
                        ctx.fill();
                    }
                }
            }
        }
    }

    // 5. Aplicar granulado
    const finalImageData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    const finalData = finalImageData.data;
    const grainAmount = 25;
    for (let i = 0; i < finalData.length; i += 4) {
        const grain = (Math.random() - 0.5) * grainAmount;
        finalData[i] = Math.max(0, Math.min(255, finalData[i] + grain));
        finalData[i+1] = Math.max(0, Math.min(255, finalData[i+1] + grain));
        finalData[i+2] = Math.max(0, Math.min(255, finalData[i+2] + grain));
    }
    ctx.putImageData(finalImageData, 0, 0);
  }, [activeFilter, filterSettings, colorSettings, customFont, framingSettings, isHalftoneEnabled, halftoneSettings]);


  // Hook principal para renderizar el canvas visible
  useEffect(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!imageUrl || !canvas) return;

    const render = () => {
      // Nos aseguramos de que la imagen esté completamente cargada antes de dibujar
      if (img.complete && img.naturalWidth > 0) {
        applyAllEffects(canvas, img, true, framingOption);
      }
    };

    if (img.src !== imageUrl) {
      img.onload = render;
      img.src = imageUrl;
    } else {
      render();
    }
  }, [imageUrl, applyAllEffects, framingOption, filterSettings, colorSettings, activeFilter, customFont, framingSettings, isHalftoneEnabled, halftoneSettings]);
  
    const generateFocusMask = useCallback(async () => {
        if (!image || isLoading) return;
        updateSettings('depthBlur', { analyzing: true });
        setIsLoading(true);
        setLoadingMessage('Generando máscara de foco con IA...');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const reader = new FileReader();
            reader.readAsDataURL(image);
            reader.onloadend = async () => {
                const base64data = (reader.result as string).split(',')[1];
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [
                        { text: `Analiza esta imagen e identifica el sujeto principal en primer plano. Genera una cadena de datos de ruta SVG (el atributo 'd') que delinee a este sujeto. La ruta debe estar escalada para un viewBox de 100x100. Responde con un objeto JSON que contenga una única clave: "svgPath". Ejemplo: {"svgPath": "M10 80 Q 52.5 10, 95 80 Z"}.` },
                        { inlineData: { mimeType: image.type, data: base64data } }
                    ]},
                    config: { responseMimeType: "application/json", responseSchema: {
                        type: Type.OBJECT, properties: { svgPath: { type: Type.STRING } }, required: ['svgPath']
                    }}
                });
                const jsonText = response.text.trim();
                const result = JSON.parse(jsonText);
                if (result.svgPath) {
                    updateSettings('depthBlur', { maskPath: result.svgPath });
                }
            };
        } catch (error) {
            console.error("Error generando la máscara de foco:", error);
            alert("Hubo un error al generar la máscara de foco con la IA.");
        } finally {
            updateSettings('depthBlur', { analyzing: false });
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [image, isLoading]);

  // Analizar estructura con Gemini
  const analyzeStructure = useCallback(async () => {
    if (!image || isLoading) return;
    setIsLoading(true);
    setLoadingMessage('Analizando imagen con IA...');
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const reader = new FileReader();
        reader.readAsDataURL(image);
        reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [
                    { text: `Analiza esta imagen e identifica nodos estructurales clave. Estos nodos deben anclarse en las áreas de mayor contraste que definen aspectos relevantes de la foto, como los bordes nítidos de objetos y sujetos. Prioriza puntos en extremidades y partes del cuerpo humano, así como en objetos predominantes con contornos definidos (plantas, árboles, sillas, edificios, etc.), tanto humanos como no humanos. Devuelve la respuesta como un objeto JSON con una única clave "points", que es un array de objetos. Cada objeto debe tener propiedades "x" e "y" que representen coordenadas normalizadas (de 0 a 1). Ejemplo: {"points": [{"x": 0.5, "y": 0.25}]}. Proporciona al menos 30 puntos si es posible.` },
                    { inlineData: { mimeType: image.type, data: base64data } }
                ]},
                config: { responseMimeType: "application/json", responseSchema: {
                    type: Type.OBJECT, properties: { points: { type: Type.ARRAY, items: {
                        type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } }, required: ['x', 'y']
                    }}}, required: ['points']
                }}
            });
            const jsonText = response.text.trim();
            const result = JSON.parse(jsonText);
            updateSettings('structure', { points: result.points });
        };
    } catch (error) {
        console.error("Error analizando la imagen:", error);
        alert("Hubo un error al analizar la imagen con la IA.");
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [image, isLoading]);

  useEffect(() => {
    if (activeFilter === FILTERS.STRUCTURE && image && filterSettings.structure.points.length === 0) {
      analyzeStructure();
    }
  }, [activeFilter, image, filterSettings.structure.points, analyzeStructure]);

  const exportToPNG = () => {
    const sourceImage = imageRef.current;
    if (!sourceImage || !sourceImage.src || sourceImage.naturalWidth === 0) {
        alert("No se puede exportar. Asegúrate de que la imagen está cargada.");
        return;
    }

    const exportCanvas = document.createElement('canvas');
    applyAllEffects(exportCanvas, sourceImage, false, framingOption);

    const imgData = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = imgData;
    link.download = 'resultado-filtro.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Limpieza del Object URL de la fuente al desmontar el componente
  useEffect(() => {
    return () => {
        if (customFont.url) {
            URL.revokeObjectURL(customFont.url);
        }
    };
  }, [customFont.url]);

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limpiar la fuente personalizada anterior
    if (customFont.url) {
        URL.revokeObjectURL(customFont.url);
    }
    const oldStyle = document.getElementById('custom-font-style');
    if (oldStyle) {
        oldStyle.remove();
    }

    const fontName = `user-font-${Date.now()}`;
    const fontUrl = URL.createObjectURL(file);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const formatMap: {[key: string]: string} = {
        'ttf': 'truetype',
        'otf': 'opentype',
        'woff': 'woff',
        'woff2': 'woff2',
    };
    const fontFormat = formatMap[extension] ? `format('${formatMap[extension]}')` : '';

    const newStyle = document.createElement('style');
    newStyle.id = 'custom-font-style';
    newStyle.appendChild(document.createTextNode(`
        @font-face {
            font-family: '${fontName}';
            src: url('${fontUrl}') ${fontFormat};
        }
    `));
    document.head.appendChild(newStyle);

    setCustomFont({ name: `'${fontName}'`, url: fontUrl });
  };
  
  const handleFramingChange = (option: string) => {
    setFramingOption(option);
    setFramingSettings({ scale: 1, offsetX: 0, offsetY: 0 });
  };


  const renderControls = () => {
      if (!image) return null;
      switch (activeFilter) {
          case FILTERS.MOTION_BLUR:
              const s = filterSettings.motionBlur;
              return (<>
                  <h3 className="text-lg font-semibold mb-2">Desenfoque de Movimiento</h3>
                  <label className="block mb-1 text-sm text-gray-600">Posición Foco X: {s.pointX}</label>
                  <input type="range" min="0" max="100" value={s.pointX} onChange={(e) => updateSettings('motionBlur', { pointX: parseInt(e.target.value) })} className="w-full" />
                  <label className="block mt-4 mb-1 text-sm text-gray-600">Posición Foco Y: {s.pointY}</label>
                  <input type="range" min="0" max="100" value={s.pointY} onChange={(e) => updateSettings('motionBlur', { pointY: parseInt(e.target.value) })} className="w-full" />
                  <label className="block mt-4 mb-1 text-sm text-gray-600">Intensidad: {s.intensity}</label>
                  <input type="range" min="0" max="50" value={s.intensity} onChange={(e) => updateSettings('motionBlur', { intensity: parseInt(e.target.value) })} className="w-full" />
              </>);
          case FILTERS.PORTRAIT_BLUR_AI:
              const d = filterSettings.depthBlur;
              return (<>
                  <h3 className="text-lg font-semibold mb-2">Desenfoque de Retrato (IA)</h3>
                  <p className="text-sm text-gray-500 mb-4">Utiliza IA para detectar el sujeto principal y desenfocar el fondo, creando un efecto de profundidad de campo.</p>
                  <button 
                      onClick={generateFocusMask}
                      disabled={d.analyzing}
                      className="w-full bg-black text-white font-semibold py-2 px-4 mb-4 transition-colors duration-200 hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                      {d.analyzing ? 'Analizando...' : 'Generar Máscara de Foco'}
                  </button>
                  { d.maskPath && !d.analyzing && (
                      <div className="animate-fadeIn">
                          <label className="block mt-4 mb-1 text-sm text-gray-600">Intensidad Desenfoque: {d.intensity}</label>
                          <input type="range" min="0" max="20" value={d.intensity} onChange={(e) => updateSettings('depthBlur', { intensity: parseInt(e.target.value) })} className="w-full" />
                      </div>
                  )}
              </>);
          case FILTERS.TEXT_OVERLAY:
            const t = filterSettings.textOverlay;
            return (<>
                <h3 className="text-lg font-semibold mb-2">Texto Aleatorio</h3>
                <textarea value={t.text} onChange={(e) => updateSettings('textOverlay', { text: e.target.value })} className="w-full bg-gray-50 p-2 border border-gray-300 text-black placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-black" rows={3}></textarea>
                <div className="flex items-center mt-4"><input type="checkbox" id="textBlur" checked={t.blur} onChange={(e) => updateSettings('textOverlay', { blur: e.target.checked })} className="mr-2 h-4 w-4 accent-black" /><label htmlFor="textBlur" className="text-sm">Desenfoque Gaussiano</label></div>
                <div className="mt-4">
                  <label htmlFor="font-upload" className="block mb-2 text-sm font-medium">Fuente Personalizada</label>
                  <input 
                      id="font-upload"
                      type="file" 
                      accept=".ttf,.otf,.woff,.woff2"
                      onChange={handleFontUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:border file:border-black file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-gray-100 cursor-pointer"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                      Fuente actual: {customFont.name.replace(/'/g, '').replace('user-font-', 'Cargada ')}
                  </p>
                </div>
            </>);
          case FILTERS.STRUCTURE:
            const st = filterSettings.structure;
            return (<>
                <h3 className="text-lg font-semibold mb-2">Análisis Estructural</h3>
                {isLoading && <p className="text-gray-600 animate-pulse">{loadingMessage || 'Procesando...'}</p>}
                <label className="block mb-1 text-sm text-gray-600">Complejidad: {st.complexity}%</label>
                <input type="range" min="1" max="100" value={st.complexity} onChange={(e) => updateSettings('structure', { complexity: parseInt(e.target.value) })} className="w-full" />
                <label className="block mt-4 mb-1 text-sm text-gray-600">Dinamismo: {st.dynamism}%</label>
                <input type="range" min="0" max="100" value={st.dynamism} onChange={(e) => updateSettings('structure', { dynamism: parseInt(e.target.value) })} className="w-full" />
                <label className="block mt-4 mb-1 text-sm text-gray-600">Fragmentación: {st.fragmentation}%</label>
                <input type="range" min="0" max="100" value={st.fragmentation} onChange={(e) => updateSettings('structure', { fragmentation: parseInt(e.target.value) })} className="w-full" />
                <label className="block mt-4 mb-1 text-sm text-gray-600">Color</label>
                <input type="color" value={st.color} onChange={(e) => updateSettings('structure', { color: e.target.value })} className="w-full bg-white border border-gray-300 h-10" />
            </>);
          default: return null;
      }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col p-4 md:p-8">
      <header className="text-center mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Efecto Filtro Fotos</h1>
        <p className="text-gray-500 mt-1">Sube una imagen y aplica filtros artísticos en tiempo real.</p>
      </header>
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
        <div className="lg:col-span-2 bg-gray-100 p-2 flex justify-center items-center min-h-[400px] lg:h-auto transition-all duration-500 relative">
          {isLoading && (
            <div className="absolute inset-0 bg-white bg-opacity-80 flex justify-center items-center z-10">
                <p className="text-gray-600 text-xl animate-pulse">{loadingMessage || 'Procesando...'}</p>
            </div>
          )}
          {!imageUrl ? (
             <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className="w-full h-full border-2 border-dashed border-gray-300 flex flex-col justify-center items-center text-center cursor-pointer transition-colors duration-300">
                <input type="file" id="file-upload" className="hidden" accept="image/*,.heic,.heif" onChange={(e) => handleFileChange(e.target.files)} />
                <label htmlFor="file-upload" className="cursor-pointer p-8">
                    <p className="text-2xl font-semibold">Arrastra y suelta una imagen</p>
                    <p className="text-gray-500 mt-2">o haz clic para seleccionar un archivo</p>
                </label>
             </div>
          ) : (<div className="w-full h-full flex justify-center items-center"><canvas ref={canvasRef} className="max-w-full max-h-full object-contain"></canvas></div>)}
        </div>
        <div className="bg-white p-6 flex flex-col border border-gray-200">
          <h2 className="text-2xl font-semibold mb-4 border-b border-gray-200 pb-3">Panel de Control</h2>
          {image ? (
            <div className="flex-grow flex flex-col">
                <div className="mb-6">
                    <button 
                        onClick={() => setIsFramingOpen(!isFramingOpen)}
                        className="w-full flex justify-between items-center text-left text-lg font-semibold mb-3 p-2 hover:bg-gray-100 transition-colors"
                    >
                        Reencuadre
                        <svg className={`w-5 h-5 transition-transform duration-300 ${isFramingOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {isFramingOpen && (
                        <div className="space-y-4 animate-fadeIn">
                          <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => handleFramingChange('original')} className={`p-2 text-xs font-semibold transition-colors duration-200 border ${framingOption === 'original' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:bg-gray-100'}`}>Original</button>
                              <button onClick={() => handleFramingChange('16:9')} className={`p-2 text-xs font-semibold transition-colors duration-200 border ${framingOption === '16:9' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:bg-gray-100'}`}>Horizontal (1920x1080)</button>
                              <button onClick={() => handleFramingChange('9:16')} className={`p-2 text-xs font-semibold transition-colors duration-200 border ${framingOption === '9:16' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:bg-gray-100'}`}>Story (1080x1920)</button>
                              <button onClick={() => handleFramingChange('3:4')} className={`p-2 text-xs font-semibold transition-colors duration-200 border ${framingOption === '3:4' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:bg-gray-100'}`}>Feed (1080x1440)</button>
                          </div>
                          {framingOption !== 'original' && (
                            <div className="pt-4 mt-4 border-t border-gray-200 animate-fadeIn space-y-4">
                                <div>
                                    <label className="block mb-1 text-sm text-gray-600">Escala: {framingSettings.scale.toFixed(2)}x</label>
                                    <input type="range" min="1" max="3" step="0.01" value={framingSettings.scale} onChange={(e) => setFramingSettings(prev => ({ ...prev, scale: parseFloat(e.target.value) }))} className="w-full" />
                                </div>
                                <div>
                                    <label className="block mb-1 text-sm text-gray-600">Desplazar X: {framingSettings.offsetX}</label>
                                    <input type="range" min="-100" max="100" value={framingSettings.offsetX} onChange={(e) => setFramingSettings(prev => ({ ...prev, offsetX: parseInt(e.target.value) }))} className="w-full" />
                                </div>
                                <div>
                                    <label className="block mb-1 text-sm text-gray-600">Desplazar Y: {framingSettings.offsetY}</label>
                                    <input type="range" min="-100" max="100" value={framingSettings.offsetY} onChange={(e) => setFramingSettings(prev => ({ ...prev, offsetY: parseInt(e.target.value) }))} className="w-full" />
                                </div>
                            </div>
                          )}
                        </div>
                    )}
                </div>
                 <div className="mb-6">
                    <button 
                        onClick={() => setIsColorOpen(!isColorOpen)}
                        className="w-full flex justify-between items-center text-left text-lg font-semibold mb-3 p-2 hover:bg-gray-100 transition-colors"
                    >
                        Color
                        <svg className={`w-5 h-5 transition-transform duration-300 ${isColorOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {isColorOpen && (
                        <div className="animate-fadeIn">
                            <label className="block mb-1 text-sm text-gray-600">Saturación: {colorSettings.saturation}%</label>
                            <input type="range" min="0" max="200" value={colorSettings.saturation} onChange={(e) => setColorSettings(prev => ({...prev, saturation: parseInt(e.target.value)}))} className="w-full" />
                            <label className="block mt-4 mb-1 text-sm text-gray-600">Contraste: {colorSettings.contrast}%</label>
                            <input type="range" min="0" max="200" value={colorSettings.contrast} onChange={(e) => setColorSettings(prev => ({...prev, contrast: parseInt(e.target.value)}))} className="w-full" />
                            <label className="block mt-4 mb-1 text-sm text-gray-600">Exposición: {colorSettings.exposure}%</label>
                            <input type="range" min="50" max="250" value={colorSettings.exposure} onChange={(e) => setColorSettings(prev => ({...prev, exposure: parseInt(e.target.value)}))} className="w-full" />
                        </div>
                    )}
                </div>
                <div className="mb-6"><h3 className="text-lg font-semibold mb-3">Seleccionar Filtro</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.values(FILTERS).map(f => (<button key={f} onClick={() => setActiveFilter(f)} className={`p-2 text-sm font-semibold transition-colors duration-200 border ${activeFilter === f ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:bg-gray-100'}`}>{f}</button>))}
                    </div>
                </div>
                <div key={activeFilter} className="flex-grow mb-6 animate-fadeIn">{renderControls()}</div>
                <div className="mb-6">
                    <button 
                        onClick={() => setIsHalftoneOpen(!isHalftoneOpen)}
                        className="w-full flex justify-between items-center text-left text-lg font-semibold mb-3 p-2 hover:bg-gray-100 transition-colors"
                    >
                        Semitono
                        <svg className={`w-5 h-5 transition-transform duration-300 ${isHalftoneOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {isHalftoneOpen && (
                        <div className="animate-fadeIn space-y-4">
                            <div className="flex items-center">
                                <input type="checkbox" id="halftone-enable" checked={isHalftoneEnabled} onChange={(e) => setIsHalftoneEnabled(e.target.checked)} className="mr-2 h-4 w-4 accent-black" />
                                <label htmlFor="halftone-enable" className="text-sm">Activar efecto Semitono</label>
                            </div>
                            {isHalftoneEnabled && (
                                <div className="pt-4 mt-4 border-t border-gray-200 animate-fadeIn space-y-4">
                                    <div>
                                        <label className="block mb-1 text-sm text-gray-600">Tamaño del punto: {halftoneSettings.dotSize}</label>
                                        <input type="range" min="2" max="40" step="1" value={halftoneSettings.dotSize} onChange={(e) => setHalftoneSettings(prev => ({ ...prev, dotSize: parseInt(e.target.value) }))} className="w-full" />
                                    </div>
                                    <div>
                                        <label className="block mt-4 mb-1 text-sm text-gray-600">Espaciado: {halftoneSettings.spacing}</label>
                                        <input type="range" min="2" max="40" step="1" value={halftoneSettings.spacing} onChange={(e) => setHalftoneSettings(prev => ({ ...prev, spacing: parseInt(e.target.value) }))} className="w-full" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <button onClick={exportToPNG} className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-4 transition-colors duration-200">Exportar a PNG</button>
            </div>
          ) : (<p className="text-gray-500 text-center mt-8 animate-fadeIn">Sube una imagen para empezar a editar.</p>)}
        </div>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);