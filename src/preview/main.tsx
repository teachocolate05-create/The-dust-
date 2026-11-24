// 설치 없이 바로 열어 볼 수 있는 단일 HTML 미리보기용 진입점 (npm run build:preview)
import { createRoot } from "react-dom/client";
import Game from "@/components/Game";
import "@/app/globals.css";

createRoot(document.getElementById("root")!).render(<Game />);
