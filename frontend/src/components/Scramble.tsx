"use client";

import { useEffect, useState } from "react";

const HEX = "0123456789abcdef";

/** 文字“解密”动画：text 变化时从乱码逐位显现；text 为 null 时直接显示占位符 */
export default function Scramble({ text, placeholder }: { text: string | null; placeholder: string }) {
  const [shown, setShown] = useState(placeholder);

  useEffect(() => {
    const target = text ?? placeholder;
    const total = text ? 16 : 1;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const revealed = Math.floor((step / total) * target.length);
      setShown(
        step >= total
          ? target
          : target
              .split("")
              .map((c, i) => (i < revealed ? c : HEX[(Math.random() * 16) | 0]))
              .join(""),
      );
      if (step >= total) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [text, placeholder]);

  return <>{shown}</>;
}
