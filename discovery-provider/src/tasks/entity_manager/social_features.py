import json
import logging
from typing import Union

from src.challenges.challenge_event import ChallengeEvent
from src.models.social.follow import Follow
from src.models.social.repost import Repost
from src.models.social.save import Save
from src.models.social.subscription import Subscription
from src.tasks.entity_manager.utils import (
    Action,
    EntityType,
    ManageEntityParameters,
    get_record_key,
)

logger = logging.getLogger(__name__)

action_to_record_types = {
    Action.FOLLOW: [EntityType.FOLLOW, EntityType.SUBSCRIPTION],
    Action.UNFOLLOW: [EntityType.FOLLOW, EntityType.SUBSCRIPTION],
    Action.SAVE: [EntityType.SAVE],
    Action.UNSAVE: [EntityType.SAVE],
    Action.REPOST: [EntityType.REPOST],
    Action.UNREPOST: [EntityType.REPOST],
    Action.SUBSCRIBE: [EntityType.SUBSCRIPTION],
    Action.UNSUBSCRIBE: [EntityType.SUBSCRIPTION],
}

action_to_challenge_event = {
    Action.FOLLOW: ChallengeEvent.follow,
    Action.UNFOLLOW: ChallengeEvent.follow,
    Action.SAVE: ChallengeEvent.favorite,
    Action.UNSAVE: ChallengeEvent.favorite,
    Action.REPOST: ChallengeEvent.repost,
    Action.UNREPOST: ChallengeEvent.repost,
}

create_social_action_types = {
    Action.FOLLOW,
    Action.SAVE,
    Action.REPOST,
    Action.SUBSCRIBE,
}
delete_social_action_types = {
    Action.UNFOLLOW,
    Action.UNSAVE,
    Action.UNREPOST,
    Action.UNSUBSCRIBE,
}

premium_content_validation_actions = {
    Action.SAVE,
    Action.UNSAVE,
    Action.REPOST,
    Action.UNREPOST,
}
premium_content_validation_entities = {EntityType.TRACK}


def create_social_record(params: ManageEntityParameters):
    validate_social_feature(params)

    record_types = action_to_record_types[params.action]
    create_record: Union[Save, Follow, Repost, Subscription, None] = None
    for record_type in record_types:
        if not validate_duplicate_social_feature(record_type, params):
            continue
        if record_type == EntityType.FOLLOW:
            create_record = Follow(
                blockhash=params.event_blockhash,
                blocknumber=params.block_number,
                created_at=params.block_datetime,
                txhash=params.txhash,
                follower_user_id=params.user_id,
                followee_user_id=params.entity_id,
                is_current=True,
                is_delete=False,
            )
        elif record_type == EntityType.SAVE:
            create_record = create_save(params)
        elif record_type == EntityType.REPOST:
            create_record = create_repost(params)
        elif record_type == EntityType.SUBSCRIPTION:
            create_record = Subscription(
                blockhash=params.event_blockhash,
                blocknumber=params.block_number,
                created_at=params.block_datetime,
                txhash=params.txhash,
                user_id=params.entity_id,
                subscriber_id=params.user_id,
                is_current=True,
                is_delete=False,
            )

        if create_record:
            params.add_social_feature_record(
                params.user_id,
                params.entity_type,
                params.entity_id,
                record_type,
                create_record,
            )

    # dispatch repost, favorite, follow challenges
    if create_record and params.action in action_to_challenge_event:
        challenge_event = action_to_challenge_event[params.action]
        params.challenge_bus.dispatch(
            challenge_event, params.block_number, params.user_id
        )


def get_attribute_from_record_metadata(attribute, metadata):
    if metadata:
        try:
            json_metadata = json.loads(metadata)
            attribute = json_metadata.get(attribute, None)
            return attribute
        except Exception as e:
            logger.error(
                f"entity_manager | social_features.py | Unable to parse repost metadata while indexing: {e}",
                exc_info=True,
            )
            return None
    return None


def create_save(params):
    is_save_of_repost = get_attribute_from_record_metadata(
        "is_save_of_repost", params.metadata_cid
    )
    record = Save(
        blockhash=params.event_blockhash,
        blocknumber=params.block_number,
        created_at=params.block_datetime,
        txhash=params.txhash,
        user_id=params.user_id,
        save_item_id=params.entity_id,
        save_type=params.entity_type.lower(),
        is_current=True,
        is_delete=False,
        is_save_of_repost=bool(is_save_of_repost),
    )
    return record


def create_repost(params):
    is_repost_of_repost = get_attribute_from_record_metadata(
        "is_repost_of_repost", params.metadata_cid
    )
    create_record = Repost(
        blockhash=params.event_blockhash,
        blocknumber=params.block_number,
        created_at=params.block_datetime,
        txhash=params.txhash,
        user_id=params.user_id,
        repost_item_id=params.entity_id,
        repost_type=params.entity_type.lower(),
        is_repost_of_repost=bool(is_repost_of_repost),
        is_current=True,
        is_delete=False,
    )
    return create_record


def delete_social_record(params):
    validate_social_feature(params)

    record_types = action_to_record_types[params.action]
    deleted_record = None
    for record_type in record_types:
        if not validate_duplicate_social_feature(record_type, params):
            continue
        if record_type == EntityType.FOLLOW:
            deleted_record = Follow(
                blockhash=params.event_blockhash,
                blocknumber=params.block_number,
                follower_user_id=params.user_id,
                followee_user_id=params.entity_id,
                is_current=True,
                is_delete=True,
                created_at=params.block_datetime,
                txhash=params.txhash,
            )
        elif record_type == EntityType.SAVE:
            deleted_record = Save(
                blockhash=params.event_blockhash,
                blocknumber=params.block_number,
                created_at=params.block_datetime,
                txhash=params.txhash,
                user_id=params.user_id,
                save_item_id=params.entity_id,
                save_type=params.entity_type.lower(),
                is_current=True,
                is_delete=True,
            )
        elif record_type == EntityType.REPOST:
            deleted_record = Repost(
                blockhash=params.event_blockhash,
                blocknumber=params.block_number,
                created_at=params.block_datetime,
                txhash=params.txhash,
                user_id=params.user_id,
                repost_item_id=params.entity_id,
                repost_type=params.entity_type.lower(),
                is_current=True,
                is_delete=True,
            )
        elif record_type == EntityType.SUBSCRIPTION:
            deleted_record = Subscription(
                blockhash=params.event_blockhash,
                blocknumber=params.block_number,
                created_at=params.block_datetime,
                txhash=params.txhash,
                user_id=params.entity_id,
                subscriber_id=params.user_id,
                is_current=True,
                is_delete=True,
            )

        if deleted_record:
            params.add_social_feature_record(
                params.user_id,
                params.entity_type,
                params.entity_id,
                record_type,
                deleted_record,
            )

    # dispatch repost, favorite, follow challenges
    if deleted_record and params.action in action_to_challenge_event:
        challenge_event = action_to_challenge_event[params.action]
        params.challenge_bus.dispatch(
            challenge_event, params.block_number, params.user_id
        )


def validate_social_feature(params: ManageEntityParameters):
    if params.user_id not in params.existing_records[EntityType.USER]:
        raise Exception(f"User {params.user_id} does not exist")

    wallet = params.existing_records[EntityType.USER][params.user_id].wallet
    if wallet and wallet.lower() != params.signer.lower():
        raise Exception(f"User {params.user_id} does not match signer")

    if params.entity_id not in params.existing_records[params.entity_type]:
        raise Exception(f"Entity {params.entity_id} does not exist")

    # User cannot use social feature on themself
    if params.action in (
        Action.FOLLOW,
        Action.UNFOLLOW,
        Action.SUBSCRIBE,
        Action.UNSUBSCRIBE,
    ):
        if params.user_id == params.entity_id:
            raise Exception(f"User {params.user_id} cannot {params.action} themself")
    else:
        target_entity = params.existing_records[params.entity_type][params.entity_id]
        owner_id = (
            target_entity.playlist_owner_id
            if params.entity_type == EntityType.PLAYLIST
            else target_entity.owner_id
        )
        if params.user_id == owner_id:
            raise Exception(f"User {params.user_id} cannot {params.action} themself")


def validate_duplicate_social_feature(
    record_type: EntityType, params: ManageEntityParameters
):
    # Cannot duplicate a social feature
    key = get_record_key(params.user_id, params.entity_type, params.entity_id)

    existing_record = params.existing_records.get(record_type, {}).get(key)

    if existing_record:
        duplicate_create = (
            params.action
            in (Action.REPOST, Action.SAVE, Action.FOLLOW, Action.SUBSCRIBE)
            and not existing_record.is_delete
        )
        duplicate_delete = (
            params.action
            in (Action.UNREPOST, Action.UNSAVE, Action.UNFOLLOW, Action.UNSUBSCRIBE)
            and existing_record.is_delete
        )

        if duplicate_create or duplicate_delete:
            logger.info(
                f"entity_manager.py | User {params.user_id} has already sent a {params.action} for record type {record_type} for {params.entity_type} {params.entity_id}. Skipping"
            )
            return False
    return True
