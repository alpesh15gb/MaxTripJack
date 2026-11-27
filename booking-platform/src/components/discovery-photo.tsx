import Image from "next/image";

export default function DiscoveryPhoto({ src }: { src: string }) {
  return <div className="discovery-photo">
    <Image src={src} alt="" fill sizes="(max-width: 760px) 92vw, 480px" />
  </div>;
}
