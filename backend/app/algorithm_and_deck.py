from datetime import datetime, timedelta
from dataclasses import dataclass, field
from fastapi import FastAPI, HTTPException
from fsrs import Scheduler, Card, Rating, ReviewLog 
from typing import Dict, List, Optional
from pydantic import BaseModel


## Professional scheduler parameters (tuned for optimal retention)
scheduler = Scheduler(
    parameters = (
            0.212,
            1.2931,
            2.3065,
            8.2956,
            6.4133,
            0.8334,
            3.0194,
            0.001,
            1.8722,
            0.1666,
            0.796,
            1.4835,
            0.0614,
            0.2629,
            1.6483,
            0.6014,
            1.8729,
            0.5425,
            0.0912,
            0.0658,
            0.1542,
    ),
    desired_retention = 0.9,
    learning_steps = (timedelta(minutes=1), timedelta(minutes=10), timedelta(minutes=20)),
    relearning_steps = (timedelta(minutes=20),),
    maximum_interval = 36500,
    enable_fuzzing = True
)

## Core service to handle study sessions and card reviews
class StudyService:
    def __init__(self):
        # Initialize the professional scheduler
        self.scheduler = Scheduler(
            parameters=scheduler.parameters,
            desired_retention=scheduler.desired_retention,
            learning_steps=scheduler.learning_steps,
            relearning_steps=scheduler.relearning_steps,
            maximum_interval=scheduler.maximum_interval,
            enable_fuzzing=scheduler.enable_fuzzing
        )

    def process_review(self, card_obj: Card, user_rating: int) -> tuple[Card, any]:
        """
        The core engine: Takes a card data object and a rating (1-4).
        Returns the updated card and the review log.
        """
        # Mapping simple numbers to FSRS Ratings
        rating_map = {
            1: Rating.Again,
            2: Rating.Hard,
            3: Rating.Good,
            4: Rating.Easy
        }
        
        rating = rating_map.get(user_rating, Rating.Good)
        
        # Calculate new state using the current time
        updated_card, review_log = self.scheduler.review_card(
            card_obj, 
            rating, 
            datetime.now()
        )
        
        return updated_card, review_log


## flashcard + deck data structures
@dataclass

class Flashcard:
    id: int
    front: str
    back: str
    # We can still provide a default value for FSRS state
    fsrs_state: Card = Card()

    def update_text(self, front: Optional[str] = None, back: Optional[str] = None):
        """Allows users to modify card content."""
        if front: self.front = front
        if back: self.back = back

    def process_review(self, rating_num: int):
        """Calculates new intervals when the user studies."""
        rating_map = {1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy}
        fsrs_rating = rating_map.get(rating_num, Rating.Good)
        
        # Calculate new state using global scheduler
        new_state, _ = scheduler.review_card(self.fsrs_state, fsrs_rating, datetime.now())
        self.fsrs_state = new_state
        return new_state

    def is_due(self) -> bool:
        """Checks if the card is ready for study."""
        return self.fsrs_state.due <= datetime.now()

    def to_dict(self):
        """Converts object to dictionary for the API response."""
        return {
            "id": self.id,
            "front": self.front,
            "back": self.back,
            "due": self.fsrs_state.due.isoformat(),
            "stability": round(self.fsrs_state.stability, 4),
            "difficulty": round(self.fsrs_state.difficulty, 4)
        }

@dataclass
class Deck:
    name: str
    cards: List[Flashcard] = field(default_factory=list)

    def get_due_cards(self) -> List[Flashcard]:
        """Filters cards based on the FSRS 'due' timestamp."""
        now = datetime.now()
        return [c for c in self.cards if c.fsrs_state.due <= now]
    
    def add_card(self, front: str, back: str):
        """Adds a new card to the deck with a unique ID."""
        new_id = len(self.cards) + 1
        new_card = Flashcard(id=new_id, front=front, back=back)
        self.cards.append(new_card)
        
# --- 3. API DATA MODELS ---

class CardCreate(BaseModel):
    front: str
    back: str

class ReviewInput(BaseModel):
    deck_name: str
    card_id: int
    rating: int

class CardEdit(BaseModel):
    front: Optional[str] = None
    back: Optional[str] = None

# --- 4. THE API ENDPOINTS ---

app = FastAPI(title="FSRS Memory API")

# Simple storage in memory for now
decks: Dict[str, Deck] = {"Default": Deck("Default")}

@app.get("/decks")
def list_decks():
    return list(decks.keys())

@app.post("/decks/{deck_name}")
def create_deck(deck_name: str):
    if deck_name in decks:
        raise HTTPException(status_code=400, detail="Deck exists")
    decks[deck_name] = Deck(deck_name)
    return {"message": f"Deck {deck_name} created"}

@app.post("/decks/{deck_name}/cards")
def add_card(deck_name: str, data: CardCreate):
    if deck_name not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    card_id = decks[deck_name].add_card(data.front, data.back)
    return {"card_id": card_id}

@app.get("/decks/{deck_name}/due")
def get_due(deck_name: str):
    if deck_name not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    return decks[deck_name].get_due_cards()

@app.post("/review")
def review(data: ReviewInput):
    deck = decks.get(data.deck_name)
    if not deck or data.card_id not in deck.cards:
        raise HTTPException(status_code=404, detail="Not found")
    
    card = deck.cards[data.card_id]
    new_state = card.process_review(data.rating)
    return {"next_review": new_state.due.isoformat()}

@app.patch("/decks/{deck_name}/cards/{card_id}")
def edit_card(deck_name: str, card_id: int, data: CardEdit):
    deck = decks.get(deck_name)
    if not deck or card_id not in deck.cards:
        raise HTTPException(status_code=404, detail="Not found")
    deck.cards[card_id].update_text(data.front, data.back)
    return {"status": "updated"}
