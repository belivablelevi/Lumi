import type { SVGProps } from "react";

/**
 * Lumi's mark, traced from the supplied jaw logo. The name isn't final:
 * swap this path (and `brand.name`) to rebrand.
 */
export function Mark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="175 395 820 695" fill="currentColor" role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      <path
        fillRule="evenodd"
        d="M183 915Q520 600 873 407Q995 545 982 762L870 585L775 688L718 596L601 750L582 703L485 942L597 850L620 922L770 795L833 970L937 856L940 1043L876 1078L397 1047L297 900ZM330 806L527 653A125 125 0 0 1 330 806Z"
      />
    </svg>
  );
}
