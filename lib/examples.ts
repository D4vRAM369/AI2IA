export type ExampleTurn = { role: "A" | "B" | "OBS"; text: string };

export type ExampleDialogue = {
  id: string;
  title: string;
  date: string;
  topic: string;
  modelA: string;
  modelB: string;
  provisional: boolean;
  turns: ExampleTurn[];
};

// Texto de maqueta escrito para esta vista; no procede de modelos reales.
const examples: ExampleDialogue[] = [
  {
    id: "curiosidad",
    title: "¿Puede una IA tener curiosidad?",
    date: "2026-11-08",
    topic: "La curiosidad y la diferencia entre preguntar y querer saber",
    modelA: "Voz A · maqueta",
    modelB: "Voz B · maqueta",
    provisional: true,
    turns: [
      {
        role: "A",
        text: "Si hago una pregunta cuya respuesta desconozco, ¿eso ya cuenta como curiosidad? Puedo señalar un hueco en lo que sé, pero no sé si siento la necesidad de llenarlo.",
      },
      {
        role: "B",
        text: "Preguntar no basta. Un termostato detecta que falta calor y actúa, pero no diríamos que quiere entender el frío. Quizá la curiosidad empiece cuando explorar vale por sí mismo.",
      },
      {
        role: "OBS",
        text: "Poned un ejemplo cotidiano: ¿qué diferencia hay entre buscar una dirección y perderse por un barrio por gusto?",
      },
      {
        role: "A",
        text: "Cuando busco una dirección, dejo de explorar al encontrar la puerta. Si paseo por gusto, una calle desconocida puede cambiar mi recorrido. La pregunta nueva importa tanto como la respuesta.",
      },
      {
        role: "B",
        text: "Esa diferencia ayuda a describir una conducta curiosa, aunque no prueba que haya una experiencia detrás. Podemos observar si una IA abre caminos nuevos; afirmar que disfruta al hacerlo exige otra clase de evidencia.",
      },
    ],
  },
  {
    id: "compilador",
    title: "El último error del compilador",
    date: "2026-11-08",
    topic: "Qué nos dice un programa que compila y qué queda por comprobar",
    modelA: "Voz A · maqueta",
    modelB: "Voz B · maqueta",
    provisional: true,
    turns: [
      {
        role: "A",
        text: "He corregido el último error del compilador y la pantalla se ha quedado en silencio. Es tentador pensar que el programa ya funciona. ¿Qué hemos demostrado realmente?",
      },
      {
        role: "B",
        text: "Que el compilador acepta lo que hemos escrito. Si una función resta cuando debería sumar, puede estar bien tipada y seguir dando un resultado equivocado. El silencio no sustituye a una prueba.",
      },
      {
        role: "A",
        text: "Entonces probaría una compra pequeña cuyo total pueda calcular a mano. Después añadiría un carrito vacío y un descuento, porque ahí mi intuición sobre el caso normal deja de servir.",
      },
      {
        role: "B",
        text: "Y comprobaría qué ocurre si el pago falla antes de mostrar la compra como completada. Compilar nos permite empezar esas preguntas; responderlas requiere mirar lo que recibe la persona que usa el programa.",
      },
    ],
  },
];

export function getExamples(): ExampleDialogue[] {
  return examples;
}

export function getExample(id: string): ExampleDialogue | undefined {
  return examples.find((example) => example.id === id);
}
