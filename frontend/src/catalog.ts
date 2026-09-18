import {
  Globe,
  Users,
  ShieldCheck,
  Droplets,
  Zap,
  Printer,
  Truck,
  Cloud,
  UserRound,
  ChartNoAxesCombined,
  GraduationCap,
  Scale,
  MessagesSquare,
} from "lucide-react";
export const dimensions = [
  {
    id: "ambiental",
    title: "Ambiental",
    description: "Recursos, consumo e impacto ambiental",
    icon: Globe,
    color: "green",
    topics: [
      {
        id: "agua",
        title: "Água",
        icon: Droplets,
        codes: ["A.1.1.1", "A.1.1.2"],
      },
      {
        id: "energia",
        title: "Energia",
        icon: Zap,
        codes: ["A.2.1.1", "A.2.1.2", "A.2.2.1"],
      },
      { id: "consumo", title: "Consumo", icon: Printer, codes: ["A.3.2.1"] },
      { id: "logistica", title: "Logística", icon: Truck, codes: ["A.4.1.1"] },
      {
        id: "mudancas-climaticas",
        title: "Mudanças climáticas",
        icon: Cloud,
        codes: ["A.5.1.1"],
      },
    ],
  },
  {
    id: "social",
    title: "Social",
    description: "Pessoas, diversidade e desenvolvimento",
    icon: Users,
    color: "blue",
    topics: [
      { id: "pessoas", title: "Pessoas", icon: UserRound, codes: ["S.1.1.1"] },
      {
        id: "diversidade",
        title: "Diversidade",
        icon: ChartNoAxesCombined,
        codes: ["S.1.1.2", "S.1.1.3", "S.1.2.1"],
      },
      {
        id: "treinamento",
        title: "Treinamento e desenvolvimento",
        icon: GraduationCap,
        codes: ["S.1.4.2"],
      },
    ],
  },
  {
    id: "governanca",
    title: "Governança",
    description: "Ética, compliance e transparência",
    icon: ShieldCheck,
    color: "orange",
    topics: [
      {
        id: "compliance",
        title: "Compliance",
        icon: Scale,
        codes: ["G.1.1.7"],
      },
      {
        id: "transparencia",
        title: "Transparência",
        icon: MessagesSquare,
        codes: ["G.3.2.1", "G.3.2.3"],
      },
    ],
  },
];
