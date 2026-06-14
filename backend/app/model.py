from pydantic import BaseModel, EmailStr
from enum import Enum
from typing import Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from fastapi import FastAPI, HTTPException
from fsrs import Scheduler, Card, Rating, ReviewLog 
from typing import Dict, List, Optional
from fastapi.middleware.cors import CORSMiddleware

# enum to represent user types
class UserType(str, Enum):
    STUDENT = "Student"
    TEACHER = "Teacher"

class AccountBase(BaseModel):
    email: EmailStr
    display_name: str
    account_type: UserType
    id: Optional[int] = None  # Assigned by the database

# 2. For Registration (What the user sends)
class AccountCreate(AccountBase):
    password: str  # Plain text password from the user

# 3. For the Database (What we store)
class AccountInDB(AccountBase):
    id: int
    hashed_password: str  # The secure, hashed version

# 4. For the API Response (What to send back to the frontend)
class AccountPublic(AccountBase):
    id: int


# algorithm and deck management
#     
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
    date_created: datetime = field(default_factory=datetime.now)
    created_by: AccountPublic = field(default_factory=lambda: AccountPublic(id=0))
    subject: Optional[str] = None
    is_public: bool = False

    # We can still provide a default value for FSRS state
    fsrs_state: Card = field(default_factory=Card)

    def update_card(self, update_data: dict):
        """Allows users to modify card content dynamically based on provided fields."""
        if 'front' in update_data: self.front = update_data['front']
        if 'back' in update_data: self.back = update_data['back']
        if 'subject' in update_data: self.subject = update_data['subject']
        if 'is_public' in update_data: self.is_public = update_data['is_public']

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
            "subject": self.subject,
            "Created By": self.created_by.display_name,
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
    
    def add_card(self, front: str, back: str, subject: Optional[str] = None, 
                 is_public: bool = False, created_by: Optional[AccountPublic] = None):
        """Adds a new card to the deck with a unique ID and new metadata."""
        new_id = len(self.cards) + 1
        
        # Prepare kwargs based on what was provided
        kwargs = {"id": new_id, "front": front, "back": back, "subject": subject, "is_public": is_public}
        if created_by is not None:
            kwargs["created_by"] = created_by
            
        new_card = Flashcard(**kwargs)
        self.cards.append(new_card)
        return new_card # Return the card object instead of just the ID for better API responses
    
# --- API DATA MODELS ---

class CardCreate(BaseModel):
    front: str
    back: str
    subject: Optional[str] = None
    is_public: bool = False
    created_by: Optional[AccountPublic] = None  # Accepts user data to assign creator

class CardEdit(BaseModel):
    front: Optional[str] = None
    back: Optional[str] = None
    subject: Optional[str] = None
    is_public: Optional[bool] = None

class ReviewInput(BaseModel):
    deck_name: str
    card_id: int
    rating: int

# --- THE API ENDPOINTS ---

app = FastAPI(title="FSRS Memory API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # your frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
)
print("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")
# Simple storage in memory for now, we call list of decks from this for now
decks: Dict[str, Deck] = {"Default": Deck("Default")}

def get_card_or_404(deck: Deck, card_id: int) -> Flashcard:
    card = next((c for c in deck.cards if c.id == card_id), None)
    if not card:
        raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found")
    return card

@app.get("/decks")
def list_decks():
    return list(decks.keys())

@app.post("/decks/{deck_name}")
def create_deck(deck_name: str):
    if deck_name in decks:
        raise HTTPException(status_code=400, detail="Deck exists")
    decks[deck_name] = Deck(deck_name)
    return {"message": f"Deck {deck_name} created"}

@app.post("/decks/{deck_name}/cards/add")
def add_card(deck_name: str, data: CardCreate):
    if deck_name not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # Pass all the newly supported fields to the deck method
    new_card = decks[deck_name].add_card(
        front=data.front, 
        back=data.back,
        subject=data.subject,
        is_public=data.is_public,
        created_by=data.created_by
    )
    return {"message": "Card created successfully", "card": new_card.to_dict()}

# get all cards in a deck/specific subject, return dictionary due to how JSON interacts
@app.get("/decks/{deck_name}/cards")
def get_all_cards(deck_name: str):
    """Returns a list of all cards inside a specific deck."""
    if deck_name not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    return [card.to_dict() for card in decks[deck_name].cards]

# get all cards GLOBALLY
@app.get("/cards") 
def get_all_cards_global() -> List[Flashcard]:
    """Returns a list of ALL cards across all decks, regardless of deck association. May cause lag"""
    return [card.to_dict() for deck in decks.values() for card in deck.cards]

# Get statistics (how many due, new, and reviewed today)
@app.get("/stats")
def get_statistics() -> Dict[str, int]:
    due_count = 0
    new_count = 0
    reviewed_today_count = 0
    now = datetime.now()
    
    for deck in decks.values():
        for card in deck.cards:
            # Due when card is due, with is_due()
            if card.is_due():
                due_count += 1
            
            # New when last_reviewed is None
            if card.last_reviewed is None:
                new_count += 1
            
            # Reviewed today is when last_reviewed is today
            if card.last_reviewed is not None and card.last_reviewed.date() == now.date():
                reviewed_today_count += 1
                
    return {"due": due_count, "new": new_count, "reviewedToday": reviewed_today_count}


@app.get("/decks/${deck_name}/stats")
def get_course_statistics(deck_name: str) -> Dict[str, int]:
    due_count = 0
    new_count = 0
    reviewed_today_count = 0
    now = datetime.now()
    
    deck = decks[deck_name]
    for card in deck.cards:
        # Due when card is due, with is_due()
        if card.is_due():
            due_count += 1
        
        # New when last_reviewed is None
        if card.last_reviewed is None:
            new_count += 1
        
        # Reviewed today is when last_reviewed is today
        if card.last_reviewed is not None and card.last_reviewed.date() == now.date():
            reviewed_today_count += 1
                
    return {"due": due_count, "new": new_count, "reviewedToday": reviewed_today_count}


@app.post("/review")
def review(data: ReviewInput):
    deck = decks.get(data.deck_name)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # Use the helper
    card = get_card_or_404(deck, data.card_id)
    
    new_state = card.process_review(data.rating)
    return {"next_review": new_state.due.isoformat()}

@app.patch("/decks/{deck_name}/cards/{card_id}")
def edit_card(deck_name: str, card_id: int, data: CardEdit):
    deck = decks.get(deck_name)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # Use your helper function
    card = get_card_or_404(deck, card_id)
    
    # Convert Pydantic model to a dictionary, excluding unset (missing) fields
    # This prevents us from accidentally overwriting fields with 'None' if they weren't included in the PATCH request
    update_data = data.dict(exclude_unset=True) 
    
    card.update_card(update_data)
    
    return {"status": "updated", "card": card.to_dict()}