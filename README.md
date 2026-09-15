# 🎨 Sabotage Canvas

<div align="center">

  <p><b>Ein Multiplayer-Partyspiel: Zeichnen, Täuschen und den Imposter entlarven.</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
    <img src="https://img.shields.io/badge/Express.js-000000?style=flat-square&logo=express&logoColor=white" alt="Express">
    <img src="https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socketdotjs&logoColor=white" alt="Socket.IO">
    <img src="https://img.shields.io/badge/Hosting-Render-F46800?style=flat-square&logo=render&logoColor=white" alt="Render">
  </p>
</div>

---

## 🔗 Live-Demo
Probiere das Spiel direkt im Browser aus (öffne am besten mehrere Tabs für den Multiplayer-Test):  
👉 [sabotage-canvas.onrender.com](https://sabotage-canvas.onrender.com/)

---

## 📖 Über das Projekt
**Sabotage Canvas** ist ein interaktives Echtzeit-Multiplayer-Spiel. Spieler treten in Runden gegeneinander an: Alle bis auf den "Imposter" kennen das geheime Wort. Es wird abwechselnd auf einem Canvas gezeichnet, gefolgt von einer Voting- und Showdown-Phase, um den Saboteur zu entlarven.

---

## ✨ Hauptfunktionen
* 🚪 **Lobby-System:** Raum-Beitritt unkompliziert per 4-stelligen Code.
* ⚡ **Echtzeit-Kommunikation:** Nahtlose Synchronisation der Zeichen-Turns über Socket.IO.
* ⏱️ **Dynamischer Ablauf:** Kurze Timer pro Zeichen-Zug (3 Sekunden) für schnellen Spielspaß.
* 🗳️ **Voting & Showdown:** Gemeinsames Abstimmen und Erraten des geheimen Wortes.

---

## 🛠️ Verwendete Technologien
| Bereich | Technologie / Tool |
| :--- | :--- |
| **Backend** | Node.js, Express |
| **Echtzeit-WebSockets** | Socket.IO |
| **Frontend** | HTML5 Canvas, CSS, JavaScript (statisch im `public/`-Ordner) |
| **Hosting** | Render (Continuous Deployment) |

---

## 📌 Hinweis
Dieses Projekt dient der Demonstration von Echtzeit-Anwendungen und WebSockets im Rahmen meiner Web-Entwicklungspraktiken. Es zeigt den umgesetzten Funktionsumfang und die Server-Architektur.
