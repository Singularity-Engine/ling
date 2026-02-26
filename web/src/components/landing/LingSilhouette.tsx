import { memo } from "react";
import styles from "./LingSilhouette.module.css";

interface LingSilhouetteProps {
  visible: boolean;
  breathing?: boolean;
}

export const LingSilhouette = memo(function LingSilhouette({
  visible,
  breathing = false,
}: LingSilhouetteProps) {
  return (
    <svg
      className={`${styles.silhouette} ${breathing ? styles.breathing : ""}`}
      data-visible={visible ? "true" : "false"}
      viewBox="0 0 200 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Abstract feminine silhouette — head, shoulders, torso, flowing dress */}
      <path
        d="M100 40 C85 40 75 55 75 70 C75 85 85 95 100 95 C115 95 125 85 125 70 C125 55 115 40 100 40Z
           M80 95 C70 100 60 115 58 135 L55 200 C50 260 60 320 70 380 L65 460 C65 470 75 480 100 480 C125 480 135 470 135 460 L130 380 C140 320 150 260 145 200 L142 135 C140 115 130 100 120 95Z"
        fill="var(--ling-purple, #8b5cf6)"
        opacity="0.3"
      />
      {/* Hair flowing effect */}
      <path
        d="M75 60 C65 65 55 90 50 120 C48 135 52 125 58 110
           M125 60 C135 65 145 90 150 120 C152 135 148 125 142 110"
        stroke="var(--ling-purple-light, #a78bfa)"
        strokeWidth="2"
        opacity="0.2"
        fill="none"
      />
    </svg>
  );
});
