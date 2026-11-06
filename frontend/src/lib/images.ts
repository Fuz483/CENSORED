const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1600;

/** Reads a user photo, downscales it and returns a compact JPEG data URL. */
export async function fileToPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Нужен файл изображения: JPG, PNG или WebP.");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Фото больше 12 МБ. Выберите файл поменьше.");
  }

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });

  try {
    const image = await loadImage(source);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return source;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return source;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть изображение."));
    image.src = src;
  });
}
