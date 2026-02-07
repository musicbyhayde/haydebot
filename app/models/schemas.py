from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum

class BaseSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class LeadStatus(str, Enum):
    NEW = "New"
    PROCESSING = "Processing"
    DISTRIBUTED = "Distributed"
    ASSIGNED = "Assigned"
    MANUAL = "Manual"
    CLOSED = "Closed"
    LOST = "Lost"

class ConversationState(str, Enum):
    START = "START"
    AWAITING_SERVICE = "AWAITING_SERVICE"
    AWAITING_DATE = "AWAITING_DATE"
    AWAITING_LOCATION = "AWAITING_LOCATION"
    AWAITING_GUESTS = "AWAITING_GUESTS"
    COMPLETED = "COMPLETED"

class ServiceType(str, Enum):
    BOUZOUKI = "Bouzouki"
    BAND = "Band"
    DJ = "DJ"
    RECEPTION = "Reception"
    TALK = "Talk"
    OTHER = "Other"

class LeadBase(BaseSchema):
    phone: str = Field(..., alias="Phone")
    name: Optional[str] = Field(None, alias="Name")
    status: LeadStatus = Field(LeadStatus.NEW, alias="Status")
    conversation_state: ConversationState = Field(ConversationState.START, alias="Conversation_State")
    last_interaction: Optional[datetime] = Field(None, alias="Last_Interaction")
    service: Optional[ServiceType] = Field(None, alias="Service")
    event_date: Optional[str] = Field(None, alias="Event_Date") 
    location: Optional[str] = Field(None, alias="Location")
    guests: Optional[str] = Field(None, alias="Guests")
    bot_mute_until: Optional[datetime] = Field(None, alias="Bot_Mute_Until")
    last_summary: Optional[str] = Field(None, alias="Last_Summary")

class LeadCreate(LeadBase):
    pass

class LeadUpdate(BaseSchema):
    name: Optional[str] = Field(None, alias="Name")
    status: Optional[LeadStatus] = Field(None, alias="Status")
    conversation_state: Optional[ConversationState] = Field(None, alias="Conversation_State")
    last_interaction: Optional[datetime] = Field(None, alias="Last_Interaction")
    service: Optional[ServiceType] = Field(None, alias="Service")
    event_date: Optional[str] = Field(None, alias="Event_Date")
    location: Optional[str] = Field(None, alias="Location")
    guests: Optional[str] = Field(None, alias="Guests")
    musician_assigned: Optional[List[str]] = Field(None, alias="Musician_Assigned") 
    bot_mute_until: Optional[datetime] = Field(None, alias="Bot_Mute_Until")
    last_summary: Optional[str] = Field(None, alias="Last_Summary")

class LeadResponse(LeadBase):
    id: str # Airtable Record ID
    created_at: Optional[datetime] = Field(None, alias="Created")
    musician_assigned: Optional[List[str]] = Field(default_factory=list, alias="Musician_Assigned")

class MusicianBase(BaseSchema):
    name: str = Field(..., alias="Name")
    phone: str = Field(..., alias="Phone")
    is_favorite: bool = Field(False, alias="Is_Favorite")
    is_active: bool = Field(True, alias="Is_Active")
    score: int = Field(0, alias="Score")

class MusicianResponse(MusicianBase):
    id: str

class MessageCreate(BaseSchema):
    lead: Optional[List[str]] = Field(None, alias="Lead") # Link to Lead Record ID
    musician: Optional[List[str]] = Field(None, alias="Musician") # Link to Musician Record ID
    direction: str = Field(..., alias="Direction") # Inbound/Outbound
    content: str = Field(..., alias="Content")
    timestamp: datetime = Field(..., alias="Timestamp")
    status: str = Field("Sent", alias="Status")
    id: Optional[str] = Field(None, alias="ID") # Was WhatsApp_ID
