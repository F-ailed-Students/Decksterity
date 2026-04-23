from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import List

@dataclass
class Flashcard:
    front: str
    back: str
    interval: int = 1  # Days until next review
    ease_factor: float = 2.5
    next_review: datetime = datetime.now()

    def update_srs(self, quality: int):
        """
        Update the card based on user rating (0-3 or 0-5).
        This is where algorithm logic lives.
        """
        # Example logic: double the interval if it was 'Easy'
        if quality >= 3:
            self.interval *= 2
        else:
            self.interval = 1
        
        self.next_review = datetime.now() + timedelta(days=self.interval)

# Create a "Deck" (a simple list)
@dataclass
class Deck:
    name: str
    # 'field' allows us to start with an empty list safely
    cards: List[Flashcard] = field(default_factory=list)

    def add_card(self, front: str, back: str):
        """Creates a new card and adds it to this deck."""
        new_card = Flashcard(front=front, back=back)
        self.cards.append(new_card)
    
    def get_due_cards(self):
        """Returns a list of cards where the review date is now or in the past."""
        now = datetime.now()
        due_cards = []
        
        for card in self.cards:
            if card.next_review <= now:
                due_cards.append(card)
        
        return due_cards
    
# Example usage